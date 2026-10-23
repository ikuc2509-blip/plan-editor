// Лист на экране: перетаскивание объектов, поворот ручкой, выноски, сдвиг и масштаб листа.
// Тот же лист в режиме «На месте» (этап 8): только чертёж, схематично, два пальца — масштаб.
import { signal, type Signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Callout, Item, Marker, Mm, Plan, SelKind, WallItem } from '../../model/types';
import { moveTo, patch, setAngle, setSheet } from '../../model/actions';
import { drawSheet, sheetGeom, sheetLayout } from '../../render/sheet';
import type { Box } from '../../render/layout';
import { locate, segOf, unf, wallDelta, type Spot } from '../../geometry/unfold';
import { angleFromHandle, snapAngle, snapMm } from '../../geometry/rotate';
import { dispatch, endGesture, gridStep, plan, sel, tab, toast, zoom, type TabKey } from '../store';
import type { MeasureRef } from '../../model/measure';
import { openMeasure } from '../common/MeasureDialog';
import { wallImages } from '../rectify';

const TAB_FOR: Record<SelKind, TabKey> = { wi: 'walls', it: 'items', mk: 'markers', co: 'callouts' };
const COL = { wi: 'wallItems', it: 'items', mk: 'markers', co: 'callouts' } as const;

export const PRINT_HINT = 'Печать PDF: масштаб 100 % («Фактический размер»), без подгонки по размеру страницы — иначе масштаб плана исказится.';

export const ZOOM_MIN = 0.4, ZOOM_MAX = 6;

/** масштаб плана в режиме «На месте» — свой, чтобы не сбивать «Чистовик» */
export const onsiteZoom = signal(1);

/** План «На месте» — всегда схематично (decisions.md, этап 8) */
export const schematicView = (p: Plan): Plan => (p.sheet.mode === 'schematic' ? p : setSheet(p, { mode: 'schematic' }));

type Obj = WallItem | Item | Marker | Callout;

interface Drag {
  /** move — объект; rot — ручка поворота; tip — кончик стрелки выноски; pan — сдвиг листа */
  mode: 'move' | 'rot' | 'tip' | 'pan';
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

  const svgPt = (e: PointerEvent) => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
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
    if (onPlace) {
      // новая метка: место — по отпусканию пальца, если он не сдвигал план
      drag.current = { mode: 'pan', key, start, client: client(), moved: false, place: true };
      return;
    }
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
      const z = sn(Math.max(0, Math.min(g.h, qq.z.mm / 1000 + dz)));
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
    endGesture();
    if (d?.pick && e.type === 'pointerup') {
      // объект — выбрать (и после перетаскивания); пустое место — снять выбор, если план не сдвигали
      if (d.mode === 'move') { sel.value = { kind: d.kind!, id: d.id! }; onSelect?.(d.kind!); }
      else if (!d.moved) sel.value = null;
    }
    if (d?.place && !d.moved && e.type === 'pointerup' && onPlace) {
      const spot = locate(sheetGeom(view(plan.value)), d.start.x, d.start.y);
      if (spot) onPlace(spot); else toast('Коснитесь пола или развёртки стены');
    }
  };

  return (
    <div class={'stage' + (onsite ? ' os-stage' : '')} ref={stageRef}>
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
        dangerouslySetInnerHTML={{ __html: drawSheet(shown, { sel: sel.value, grid: gridStep.value, screen: true, touch: onsite, wallImages: wallImages.value }) + markSvg(shown, mark) }}
      />
      {!onsite && (
        <>
          <div class="legendline">Перетаскивайте предметы, метки, подписи и элементы стен мышью; Alt — без привязки к сетке. Синий кружок над предметом — поворот. Ctrl + колесо — масштаб, перетаскивание пустого места — сдвиг листа. Щелчок по размеру (L, W, h, расстояния от меток) — ввести замер.</div>
          <div class="legendline">{PRINT_HINT}</div>
        </>
      )}
    </div>
  );
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
