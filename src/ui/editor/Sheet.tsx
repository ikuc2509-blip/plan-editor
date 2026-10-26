// Лист на экране: перетаскивание объектов, поворот ручкой, выноски, сдвиг и масштаб листа.
// Тот же лист в режиме «На месте» (этап 8): только чертёж, схематично, два пальца — масштаб.
import { signal, type Signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Callout, Item, Marker, Mm, Plan, Point, SelKind, WallItem } from '../../model/types';
import { moveCorner, moveTo, patch, setAngle, setSheet, setWallElev, snapWallZ } from '../../model/actions';
import { drawSheet, sheetGeom, sheetLayout } from '../../render/sheet';
import type { Box } from '../../render/layout';
import { locate, segOf, unf, wallDelta, type Spot } from '../../geometry/unfold';
import { angleFromHandle, snapAngle, snapMm } from '../../geometry/rotate';
import { dispatch, endGesture, gridStep, plan, sel, tab, toast, zoom, type TabKey } from '../store';
import type { MeasureRef } from '../../model/measure';
import { openMeasure } from '../common/MeasureDialog';
import { wallImages } from '../rectify';
import { pickSuggestion, suggSel, suggestions } from '../recognize';
import { suggestSvg } from '../common/Suggestions';
import { fullMode } from '../mode';
import { addCorner, applyShape, cornerSnap, cancelDraw, cancelShape, cornerAt, drawHover, drawing, finishDraw, shapeCorner, shaping, startDraw, startShape, takeTemplate, undoCorner } from '../draw';
import { isRect, noRoom } from '../../model/room';
import { fmt } from '../../render/svg';

const TAB_FOR: Record<SelKind, TabKey> = { wi: 'walls', it: 'items', mk: 'markers', co: 'callouts' };
const COL = { wi: 'wallItems', it: 'items', mk: 'markers', co: 'callouts' } as const;

export const PRINT_HINT = 'Печать PDF: масштаб 100 % («Фактический размер»), без подгонки по размеру страницы — иначе масштаб плана исказится.';

export const ZOOM_MIN = 0.4, ZOOM_MAX = 6;

/** сенсорный экран: про Shift не пишем */
const touchScreen = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);

/** подсказка на полоске рисования скрыта — остаются кнопки */
const hintHidden = signal(false);

/** линия-направляющая при выравнивании элементов стены: какая стена и высота, мм */
const guide = signal<{ wallId: string; z: Mm } | null>(null);

/** масштаб плана в режиме «На месте» — свой, чтобы не сбивать «Чистовик» */
export const onsiteZoom = signal(1);

/** План «На месте» — всегда схематично (decisions.md, этап 8) */
export const schematicView = (p: Plan): Plan => (p.sheet.mode === 'schematic' ? p : setSheet(p, { mode: 'schematic' }));

type Obj = WallItem | Item | Marker | Callout;

interface Drag {
  /** move — объект; rot — ручка поворота; tip — кончик стрелки выноски; pan — сдвиг листа; corner — угол комнаты */
  mode: 'move' | 'rot' | 'tip' | 'pan' | 'corner' | 'shape' | 'elev';
  /** развёртка, которую несут: стена и прежний сдвиг, мм */
  elev?: { wallId: string; dx: Mm; dy: Mm };
  /** угол комнаты (этап 12) */
  corner?: number;
  /** рисование комнаты: касание без сдвига — новый угол */
  draw?: boolean;
  kind?: SelKind;
  id?: string;
  key: string;
  start: { x: number; y: number };
  /** для сдвига листа: где был курсор на экране и прокрутка */
  client?: { x: number; y: number; left: number; top: number };
  orig?: Obj;
  moved: boolean;
  /** режим «новая метка»: касание без сдвига ставит метку */
  place?: boolean;
  /** «На месте»: выбор — по отпусканию пальца, чтобы щипок не переключал шаг */
  pick?: boolean;
}

function findObj(s: Plan, kind: SelKind, id: string): Obj | undefined {
  return (s[COL[kind]] as Obj[]).find(x => x.id === id);
}

let dragN = 0;

/** «room:L», «tie:<id>:x» — размер на листе, по которому щёлкнули */
function parseMeasure(s: string): MeasureRef | null {
  const [t, a, b] = s.split(':');
  if (t === 'room' && (a === 'L' || a === 'W' || a === 'h')) return { t: 'room', key: a };
  if (t === 'wall' && a) return { t: 'wall', id: a };
  if (t === 'tie' && a && (b === 'x' || b === 'y')) return { t: 'tie', id: a, axis: b };
  return null;
}

interface SheetProps {
  /** режим «На месте»: схематично, без мебели и подписей на ощупь, свой масштаб */
  onsite?: boolean;
  /** показать лист целиком; иначе «На месте» — только чертёж */
  full?: boolean;
  /** режим «новая метка»: сюда приходит место касания */
  onPlace?: (s: Spot) => void;
  /** отмеченная точка (первый угол обводки) — синий крестик */
  mark?: Spot;
  /** объект выделен касанием (вместо переключения вкладки «Чистовика») */
  onSelect?: (kind: SelKind) => void;
}

/** на сколько пикселей можно сдвинуть палец, чтобы это ещё было касанием, а не сдвигом */
const TAP_PX = 8;

export function Sheet({ onsite, full, onPlace, onSelect, mark }: SheetProps = {}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  // пальцы на экране — для масштаба двумя пальцами
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; z0: number } | null>(null);
  const [base, setBase] = useState(800);
  const z: Signal<number> = onsite ? onsiteZoom : zoom;
  const view = (p: Plan) => (onsite ? schematicView(p) : p);
  const shown = view(plan.value);
  const lay = sheetLayout(shown);
  // «На месте» — только область чертежа с небольшим полем
  const box: Box = onsite && !full
    ? { x: lay.area.x - 2, y: lay.area.y - 2, w: lay.area.w + 4, h: lay.area.h + 4 }
    : { x: 0, y: 0, w: lay.w, h: lay.h };
  const gap = onsite ? { x: 12, y: 12 } : { x: 40, y: 60 };

  // ширина листа под размер окна (как «По размеру» в прототипе)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => setBase(Math.max(onsite ? 200 : 320, Math.min(stage.clientWidth - gap.x, (stage.clientHeight - gap.y) * box.w / box.h)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [lay, box.w, box.h]);

  /** новый масштаб; точка экрана (cx, cy) остаётся на месте */
  const zoomAt = (cx: number, cy: number, value: number) => {
    const stage = stageRef.current, svg = svgRef.current;
    if (!stage || !svg) return;
    const r = svg.getBoundingClientRect();
    const kx = (cx - r.left) / r.width, ky = (cy - r.top) / r.height;
    z.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
    requestAnimationFrame(() => {
      const n = svg.getBoundingClientRect();
      stage.scrollLeft += n.left + kx * n.width - cx;
      stage.scrollTop += n.top + ky * n.height - cy;
    });
  };

  // Ctrl + колесо — масштаб у курсора: точка под курсором остаётся на месте
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, z.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [onsite]);

  // рисование комнаты: Esc — отмена, Backspace — убрать последний угол, Enter — замкнуть
  useEffect(() => {
    if (!drawing.value && !shaping.value) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cancelDraw(); cancelShape(); }
      else if (!drawing.value) return;
      else if (e.key === 'Backspace') { e.preventDefault(); undoCorner(); }
      else if (e.key === 'Enter') finishDraw();
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [!!drawing.value, !!shaping.value]);

  const svgPt = (e: PointerEvent) => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  /** точка листа → мм пола (для рисования комнаты и углов) */
  const floorMm = (pt: { x: number; y: number }) => {
    const g = sheetGeom(view(plan.value));
    return { x: ((pt.x - g.fx) / g.s) * 1000, y: ((pt.y - g.fy) / g.s) * 1000, tol: (4 / g.s) * 1000 };
  };

  const twoFingers = () => {
    const [a, b] = [...fingers.current.values()];
    return { a: a!, b: b!, d: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
  };

  const onDown = (e: PointerEvent) => {
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svgRef.current!.setPointerCapture(e.pointerId);
    if (fingers.current.size === 2) {
      // второй палец — масштаб; начатое перетаскивание заканчивается
      if (drag.current?.moved) endGesture();
      drag.current = null;
      pinch.current = { d0: Math.max(1, twoFingers().d), z0: z.value };
      return;
    }
    if (fingers.current.size > 2 || e.button !== 0) return;
    const target = e.target as Element;
    const start = svgPt(e), key = `drag:${++dragN}`;
    const client = () => {
      const st = stageRef.current!;
      return { x: e.clientX, y: e.clientY, left: st.scrollLeft, top: st.scrollTop };
    };
    if (shaping.value) {
      // прямоугольник: от точки нажатия до точки отпускания
      shaping.value = { a: shapeCorner(floorMm(start)), annex: shaping.value.annex };
      drag.current = { mode: 'shape', key, start, moved: false };
      return;
    }
    if (drawing.value) {
      // рисование комнаты: угол — по отпусканию, если лист не сдвигали
      drag.current = { mode: 'pan', key, start, client: client(), moved: false, draw: true };
      return;
    }
    // угол нарисованной комнаты — тянуть
    const cEl = target.closest<SVGElement>('[data-corner]');
    if (cEl) { drag.current = { mode: 'corner', corner: +cEl.dataset.corner!, key, start, moved: false }; return; }
    if (onPlace) {
      // новая метка: место — по отпусканию пальца, если он не сдвигал план
      drag.current = { mode: 'pan', key, start, client: client(), moved: false, place: true };
      return;
    }
    // предложение модели (этап 10) — выбрать его в списке
    const sEl = onsite ? null : target.closest<SVGElement>('[data-sugg]');
    if (sEl) { pickSuggestion(sEl.dataset.sugg!); return; }
    // размер на листе — окно замера
    const mEl = target.closest<SVGElement>('[data-measure]');
    const mref = mEl && parseMeasure(mEl.dataset.measure!);
    if (mref) { openMeasure(mref); return; }
    // «На месте» на ощупь — только проёмы и метки; мебель и подписи — в «Чистовике»
    const handle = onsite ? null : target.closest<SVGElement>('[data-handle]');
    const gEl = target.closest<SVGElement>('[data-kind]');
    const gKind = gEl?.dataset.kind as SelKind | undefined;
    if (handle) {
      // ручка поворота предмета или кончик стрелки выноски
      const id = handle.dataset.id!;
      drag.current = handle.dataset.handle === 'rot'
        ? { mode: 'rot', kind: 'it', id, key, start, moved: false }
        : { mode: 'tip', kind: 'co', id, key, start, moved: false };
    } else if (gEl && gKind && (!onsite || gKind === 'wi' || gKind === 'mk')) {
      const id = gEl.dataset.id!;
      const o = findObj(plan.value, gKind, id);
      if (!o) return;
      if (!onSelect) {
        sel.value = { kind: gKind, id };
        tab.value = TAB_FOR[gKind];
      }
      drag.current = { mode: 'move', kind: gKind, id, key, start, orig: o, moved: false, pick: !!onSelect };
    } else if (!onsite && target.closest('[data-elev]')) {
      // пустое место развёртки — отнести её в сторону (этап 12)
      const wid = target.closest<SVGElement>('[data-elev]')!.dataset.elev!;
      const w = plan.value.room.walls.find(k => k.id === wid);
      drag.current = { mode: 'elev', key, start, moved: false, elev: { wallId: wid, dx: w?.elev?.dx ?? 0, dy: w?.elev?.dy ?? 0 } };
    } else {
      // пустое место: снять выделение и сдвигать лист
      if (sel.value && !onSelect) sel.value = null;
      drag.current = { mode: 'pan', key, start, client: client(), moved: false, pick: !!onSelect };
    }
  };

  const onMove = (e: PointerEvent) => {
    if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current) {
      if (fingers.current.size < 2) return;
      const { a, b, d } = twoFingers();
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.current.z0 * (d / pinch.current.d0));
      return;
    }
    const d = drag.current;
    // линия-подсказка к следующему углу
    if (drawing.value && (!d || !d.moved)) { const f = floorMm(svgPt(e)); drawHover.value = cornerAt(f, e.shiftKey, f.tol); }
    if (!d) return;
    if (d.mode === 'pan') {
      const st = stageRef.current!, c = d.client!;
      if (Math.abs(e.clientX - c.x) + Math.abs(e.clientY - c.y) > TAP_PX) d.moved = true;
      st.scrollLeft = c.left - (e.clientX - c.x);
      st.scrollTop = c.top - (e.clientY - c.y);
      return;
    }
    const g = sheetGeom(view(plan.value));
    const p = svgPt(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    // мелкое дрожание при клике — не перемещение
    if (Math.abs(dx) + Math.abs(dy) < 0.4 && !d.moved) return;
    d.moved = true;
    // привязка к сетке; Alt — без привязки
    const step: Mm = e.altKey ? 0 : gridStep.value;
    const sn = (m: number): Mm => snapMm(m * 1000, step);
    const floorM = () => ({ x: (p.x - g.fx) / g.s, y: (p.y - g.fy) / g.s });

    if (d.mode === 'elev') {
      // сдвиг — в мм пола, по 10 см (Alt — точнее)
      const el = d.elev!, st = e.altKey ? 10 : 100;
      const nx = Math.round((el.dx + (dx / g.s) * 1000) / st) * st, ny = Math.round((el.dy + (dy / g.s) * 1000) / st) * st;
      dispatch(pl => setWallElev(pl, el.wallId, { dx: nx, dy: ny }), d.key);
      return;
    }
    if (d.mode === 'shape') {
      const a = shaping.value?.a;
      if (a) shaping.value = { a, b: shapeCorner(floorMm(p)), annex: shaping.value?.annex };
      return;
    }
    if (d.mode === 'corner') {
      const f = floorMm(p), st = e.altKey ? 10 : Math.max(10, gridStep.value);
      const raw = { x: Math.round(f.x / st) * st, y: Math.round(f.y / st) * st };
      // Alt — без привязки к соседним углам
      dispatch(pl => moveCorner(pl, d.corner!, e.altKey ? raw : cornerSnap(d.corner!, raw, f.tol)), d.key);
      return;
    }
    if (d.mode === 'rot') {
      const it = plan.value.items.find(i => i.id === d.id);
      if (!it) return;
      const cx = g.fx + ((it.x.mm + it.w.mm / 2) / 1000) * g.s, cy = g.fy + ((it.y.mm + it.d.mm / 2) / 1000) * g.s;
      const a = snapAngle(angleFromHandle({ x: cx, y: cy }, p), e.altKey ? 0 : 3);
      dispatch(pl => setAngle(pl, d.id!, a), d.key);
      return;
    }
    if (d.mode === 'tip') {
      const f = floorM();
      dispatch(pl => patch(pl, 'callouts', d.id!, { target: { x: sn(f.x), y: sn(f.y) } }), d.key);
      return;
    }

    const q = d.orig!, kind = d.kind!, id = d.id!;
    if (kind === 'co') {
      const c = q as Callout;
      dispatch(pl => patch(pl, 'callouts', id, { at: { x: sn(c.at.x / 1000 + dx / g.s), y: sn(c.at.y / 1000 + dy / g.s) } }), d.key);
      return;
    }
    const onFloor = kind === 'it' || (kind === 'mk' && (q as Marker).place === 'floor');
    if (onFloor) {
      const qq = q as Item | Marker;
      const x = sn(qq.x.mm / 1000 + dx / g.s), y = sn(qq.y.mm / 1000 + dy / g.s);
      dispatch(pl => moveTo(pl, COL[kind] as 'items' | 'markers', id, { x, y }), d.key);
      return;
    }
    const qq = q as WallItem | Marker;
    const sg = segOf(g, qq.wallId);
    if (!sg) return;
    const [doff, dz] = wallDelta(sg, dx, dy, g.s);
    const off = sn(Math.max(-1, Math.min(sg.len, qq.off.mm / 1000 + doff)));
    if (kind === 'wi' || (qq as Marker).place === 'wall') {
      let z = sn(Math.max(0, Math.min(g.h, qq.z.mm / 1000 + dz)));
      // окна и радиаторы встают на уровень соседних; видна линия-направляющая (Alt — без этого)
      if (kind === 'wi' && !e.altKey) {
        const sn2 = snapWallZ(plan.value, id, qq.wallId, z, (q as WallItem).h.mm, (3 / g.s) * 1000);
        z = sn2.z;
        guide.value = sn2.line === null ? null : { wallId: qq.wallId, z: sn2.line };
      }
      dispatch(pl => moveTo(pl, COL[kind] as 'wallItems' | 'markers', id, { off, z }), d.key);
    } else {
      dispatch(pl => moveTo(pl, 'markers', id, { off }), d.key);
    }
  };

  const onUp = (e: PointerEvent) => {
    fingers.current.delete(e.pointerId);
    if (pinch.current) {
      // масштаб закончен, когда сняты оба пальца
      if (fingers.current.size === 0) pinch.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    guide.value = null;
    endGesture();
    if (d?.pick && e.type === 'pointerup') {
      // объект — выбрать (и после перетаскивания); пустое место — снять выбор, если план не сдвигали
      if (d.mode === 'move') { sel.value = { kind: d.kind!, id: d.id! }; onSelect?.(d.kind!); }
      else if (!d.moved) sel.value = null;
    }
    if (d?.mode === 'shape') {
      const sh = shaping.value;
      if (sh?.a && sh.b && e.type === 'pointerup') applyShape(sh.a, sh.b, sh.annex);
      else if (sh) shaping.value = { annex: sh.annex };
    }
    if (d?.draw && !d.moved && e.type === 'pointerup' && drawing.value) {
      const f = floorMm(d.start);
      addCorner(f, e.shiftKey, f.tol);
    }
    if (d?.place && !d.moved && e.type === 'pointerup' && onPlace) {
      const spot = locate(sheetGeom(view(plan.value)), d.start.x, d.start.y);
      if (spot) onPlace(spot); else toast('Коснитесь пола или развёртки стены');
    }
  };

  const empty = noRoom(plan.value.room), dr = drawing.value, sh = shaping.value;
  return (
    <div class={'stage' + (onsite ? ' os-stage' : '')} ref={stageRef}>
      {dr && (
        <div class="overlay-top"><div class="drawbar" role="toolbar" aria-label="Рисование комнаты">
          {!hintHidden.value && <span>{dr.pts.length < 3 ? 'Щёлкайте по углам комнаты по порядку' : 'Замкнуть — щелчок по первому углу или «Замкнуть»'}{onsite || touchScreen ? '' : '. Shift — без привязки к прямым углам'}</span>}
          <button class="ghost" aria-label={hintHidden.value ? 'Показать подсказку' : 'Скрыть подсказку'} title={hintHidden.value ? 'Показать подсказку' : 'Скрыть подсказку'} onClick={() => { hintHidden.value = !hintHidden.value; }}>{hintHidden.value ? '?' : '✕'}</button>
          <button disabled={!dr.pts.length} onClick={undoCorner}>Убрать угол</button>
          <button class="primary" disabled={dr.pts.length < 3} onClick={finishDraw}>Замкнуть</button>
          <button onClick={cancelDraw}>Отмена</button>
        </div></div>
      )}
      {sh && (
        <div class="overlay-top"><div class="drawbar" role="toolbar" aria-label="Прямоугольник">
          {!hintHidden.value && <span>{empty ? 'Протяните прямоугольник от угла до угла' : sh.annex ? 'Протяните соседнее помещение вплотную к комнате — между ними будет стена-перегородка' : 'Протяните прямоугольник так, чтобы он касался комнаты стороной — он сольётся с ней'}</span>}
          <button class="ghost" aria-label={hintHidden.value ? 'Показать подсказку' : 'Скрыть подсказку'} onClick={() => { hintHidden.value = !hintHidden.value; }}>{hintHidden.value ? '?' : '✕'}</button>
          <button onClick={cancelShape}>Отмена</button>
        </div></div>
      )}
      {empty && !dr && !sh && (
        <div class="overlay-mid"><div class="emptycard">
          <b>Комнаты пока нет</b>
          <span>Нарисуйте её по углам — или возьмите заготовку-прямоугольник и впишите размеры.</span>
          <div class="row" style="margin:0;justify-content:center">
            <button class="primary" onClick={startDraw}>Нарисовать комнату</button>
            <button onClick={() => startShape()}>Прямоугольником</button>
            <button onClick={takeTemplate}>Взять заготовку (прямоугольник)</button>
          </div>
        </div></div>
      )}
      <svg
        ref={svgRef}
        class={'sheet' + (onPlace ? ' placing' : '')}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: base * z.value + 'px' }}
        data-testid="sheet"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        dangerouslySetInnerHTML={{ __html: drawSheet(shown, { sel: sel.value, grid: gridStep.value, screen: true, touch: onsite, wallImages: fullMode.value ? wallImages.value : undefined }) + (onsite || !fullMode.value ? '' : suggestSvg(shown, suggestions.value, suggSel.value)) + markSvg(shown, mark) + guideSvg(shown, guide.value) + (dr ? drawSvg(shown, dr.pts, drawHover.value) : sh?.a && sh.b ? shapeSvg(shown, sh.a, sh.b) : !empty && !isRect(shown.room) ? cornersSvg(shown) : '') }}
      />
      {!onsite && (
        <>
          <div class="legendline">Перетаскивайте предметы, метки, выноски и элементы стен мышью; Alt — без привязки к сетке. Синий кружок над предметом — поворот. Ctrl + колесо — масштаб, перетаскивание пустого места — сдвиг листа. Щелчок по размеру (L, W, h, расстояния от меток) — ввести замер.</div>
          <div class="legendline">{PRINT_HINT}</div>
        </>
      )}
    </div>
  );
}

/** Рисование комнаты: отмеченные углы, линия к курсору, длины стен (только на экране) */
function drawSvg(p: Plan, pts: readonly Point[], hover: Point | null): string {
  const g = sheetGeom(p), at = (q: Point): [number, number] => [g.fx + (q.x / 1000) * g.s, g.fy + (q.y / 1000) * g.s];
  const all = hover ? [...pts, hover] : [...pts];
  let out = '';
  if (all.length > 1) out += `<polyline points="${all.map(q => at(q).map(v => v.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="#2F6FB3" stroke-width="0.6"/>`;
  for (let i = 1; i < all.length; i++) {
    const a = at(all[i - 1]!), b = at(all[i]!), len = Math.hypot(all[i]!.x - all[i - 1]!.x, all[i]!.y - all[i - 1]!.y) / 1000;
    if (len > 0) out += `<text x="${(a[0] + b[0]) / 2}" y="${(a[1] + b[1]) / 2 - 1.2}" font-size="2.6" text-anchor="middle" fill="#2F6FB3" font-weight="700">${fmt(len)} м</text>`;
  }
  pts.forEach((q, i) => { const [x, y] = at(q); out += `<circle cx="${x}" cy="${y}" r="${i === 0 && pts.length >= 3 ? 2.2 : 1.2}" fill="${i === 0 ? '#fff' : '#2F6FB3'}" stroke="#2F6FB3" stroke-width="0.5"/>`; });
  return `<g pointer-events="none">${out}</g>`;
}

/** Линия-направляющая через всю развёртку стены (только на экране) */
function guideSvg(p: Plan, gd: { wallId: string; z: Mm } | null): string {
  if (!gd) return '';
  const g = sheetGeom(p), sg = segOf(g, gd.wallId);
  if (!sg) return '';
  const [x1, y1] = unf(g, sg, 0, gd.z / 1000), [x2, y2] = unf(g, sg, sg.len, gd.z / 1000);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#D0332B" stroke-width="0.35" stroke-dasharray="2 1" pointer-events="none"/>`;
}

/** Прямоугольник, который тянут, с длинами сторон (только на экране) */
function shapeSvg(p: Plan, a: Point, b: Point): string {
  const g = sheetGeom(p), X = (v: number) => g.fx + (v / 1000) * g.s, Y = (v: number) => g.fy + (v / 1000) * g.s;
  const x0 = X(Math.min(a.x, b.x)), x1 = X(Math.max(a.x, b.x)), y0 = Y(Math.min(a.y, b.y)), y1 = Y(Math.max(a.y, b.y));
  const t = (x: number, y: number, v: number) => `<text x="${x}" y="${y}" font-size="2.6" text-anchor="middle" fill="#2F6FB3" font-weight="700">${fmt(v / 1000)} м</text>`;
  return `<g pointer-events="none"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#2F6FB3" fill-opacity="0.08" stroke="#2F6FB3" stroke-width="0.6" stroke-dasharray="1.5 0.8"/>` +
    t((x0 + x1) / 2, y0 - 1.2, Math.abs(a.x - b.x)) + t(x1 + 6, (y0 + y1) / 2, Math.abs(a.y - b.y)) + '</g>';
}

/** Углы нарисованной комнаты — ручки, их можно тянуть (только на экране) */
function cornersSvg(p: Plan): string {
  const g = sheetGeom(p);
  return g.segs.map((sg, i) => {
    const [x, y] = [g.fx + sg.ax * g.s, g.fy + sg.ay * g.s];
    return `<circle data-corner="${i}" cx="${x}" cy="${y}" r="1.6" fill="#fff" stroke="#2F6FB3" stroke-width="0.5" style="cursor:move"/>`;
  }).join('');
}

/** Крестик в отмеченной точке развёртки (первый угол обводки) */
function markSvg(p: Plan, s: Spot | undefined): string {
  if (!s || s.place !== 'wall') return '';
  const g = sheetGeom(p), sg = segOf(g, s.wallId);
  if (!sg) return '';
  const [x, y] = unf(g, sg, s.off / 1000, s.z / 1000);
  return `<circle cx="${x}" cy="${y}" r="1.6" fill="none" stroke="#2F6FB3" stroke-width="0.5"/>` +
    `<path d="M${x - 3} ${y}h6M${x} ${y - 3}v6" stroke="#2F6FB3" stroke-width="0.35"/>`;
}
