// Лист на экране: перетаскивание объектов, поворот ручкой, выноски, сдвиг и масштаб листа.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Callout, Item, Marker, Mm, Plan, SelKind, WallItem } from '../../model/types';
import { moveTo, patch, setAngle } from '../../model/actions';
import { drawSheet, sheetGeom, sheetLayout } from '../../render/sheet';
import { segOf, wallDelta } from '../../geometry/unfold';
import { angleFromHandle, snapAngle, snapMm } from '../../geometry/rotate';
import { dispatch, endGesture, gridStep, plan, sel, tab, zoom, type TabKey } from '../store';

const TAB_FOR: Record<SelKind, TabKey> = { wi: 'walls', it: 'items', mk: 'markers', co: 'callouts' };
const COL = { wi: 'wallItems', it: 'items', mk: 'markers', co: 'callouts' } as const;

export const PRINT_HINT = 'Печать PDF: масштаб 100 % («Фактический размер»), без подгонки по размеру страницы — иначе масштаб плана исказится.';

export const ZOOM_MIN = 0.4, ZOOM_MAX = 6;

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
}

function findObj(s: Plan, kind: SelKind, id: string): Obj | undefined {
  return (s[COL[kind]] as Obj[]).find(x => x.id === id);
}

let dragN = 0;

export function Sheet() {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [base, setBase] = useState(800);
  const lay = sheetLayout(plan.value);

  // ширина листа под размер окна (как «По размеру» в прототипе)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => setBase(Math.max(320, Math.min(stage.clientWidth - 40, (stage.clientHeight - 60) * lay.w / lay.h)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [lay]);

  // Ctrl + колесо — масштаб у курсора: точка под курсором остаётся на месте
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const kx = (e.clientX - r.left) / r.width, ky = (e.clientY - r.top) / r.height;
      zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      requestAnimationFrame(() => {
        const n = svg.getBoundingClientRect();
        stage.scrollLeft += n.left + kx * n.width - e.clientX;
        stage.scrollTop += n.top + ky * n.height - e.clientY;
      });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  const svgPt = (e: PointerEvent) => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    const start = svgPt(e), key = `drag:${++dragN}`;
    const handle = target.closest<SVGElement>('[data-handle]');
    const gEl = target.closest<SVGElement>('[data-kind]');
    if (handle) {
      // ручка поворота предмета или кончик стрелки выноски
      const id = handle.dataset.id!;
      drag.current = handle.dataset.handle === 'rot'
        ? { mode: 'rot', kind: 'it', id, key, start, moved: false }
        : { mode: 'tip', kind: 'co', id, key, start, moved: false };
    } else if (gEl) {
      const kind = gEl.dataset.kind as SelKind, id = gEl.dataset.id!;
      const o = findObj(plan.value, kind, id);
      if (!o) return;
      sel.value = { kind, id };
      tab.value = TAB_FOR[kind];
      drag.current = { mode: 'move', kind, id, key, start, orig: o, moved: false };
    } else {
      // пустое место: снять выделение и сдвигать лист
      if (sel.value) sel.value = null;
      const st = stageRef.current!;
      drag.current = { mode: 'pan', key, start, client: { x: e.clientX, y: e.clientY, left: st.scrollLeft, top: st.scrollTop }, moved: false };
    }
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') {
      const st = stageRef.current!, c = d.client!;
      st.scrollLeft = c.left - (e.clientX - c.x);
      st.scrollTop = c.top - (e.clientY - c.y);
      return;
    }
    const g = sheetGeom(plan.value);
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

  const onUp = () => { drag.current = null; endGesture(); };

  return (
    <div class="stage" ref={stageRef}>
      <svg
        ref={svgRef}
        class="sheet"
        viewBox={`0 0 ${lay.w} ${lay.h}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: base * zoom.value + 'px' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        dangerouslySetInnerHTML={{ __html: drawSheet(plan.value, { sel: sel.value, grid: gridStep.value }) }}
      />
      <div class="legendline">Перетаскивайте предметы, метки, подписи и элементы стен мышью; Alt — без привязки к сетке. Синий кружок над предметом — поворот. Ctrl + колесо — масштаб, перетаскивание пустого места — сдвиг листа.</div>
      <div class="legendline">{PRINT_HINT}</div>
    </div>
  );
}
