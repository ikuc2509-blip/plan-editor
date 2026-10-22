// Лист на экране и перетаскивание объектов мышью или пальцем.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item, Marker, Mm, Plan, SelKind, WallItem } from '../../model/types';
import { moveTo } from '../../model/actions';
import { drawSheet, SHEET_H, SHEET_W } from '../../render/sheet';
import { geom, segOf, wallDelta } from '../../geometry/unfold';
import { dispatch, endGesture, plan, sel, tab, zoom, type TabKey } from '../store';

const TAB_FOR: Record<SelKind, TabKey> = { wi: 'walls', it: 'items', mk: 'markers' };
const COL = { wi: 'wallItems', it: 'items', mk: 'markers' } as const;

/** Шаг привязки при перетаскивании — 5 см; на входе метры, на выходе мм */
const snap = (m: number): Mm => Math.round(m * 20) * 50;

type Obj = WallItem | Item | Marker;

interface Drag {
  kind: SelKind;
  id: string;
  key: string;
  start: { x: number; y: number };
  orig: Obj;
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

  // ширина листа под размер окна (как «По размеру» в прототипе)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => setBase(Math.max(320, Math.min(stage.clientWidth - 40, (stage.clientHeight - 60) * SHEET_W / SHEET_H)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  const svgPt = (e: PointerEvent) => {
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  const onDown = (e: PointerEvent) => {
    const gEl = (e.target as Element).closest<SVGElement>('[data-kind]');
    if (!gEl) { if (sel.value) sel.value = null; return; }
    const kind = gEl.dataset.kind as SelKind, id = gEl.dataset.id!;
    const o = findObj(plan.value, kind, id);
    if (!o) return;
    sel.value = { kind, id };
    drag.current = { kind, id, key: `drag:${++dragN}`, start: svgPt(e), orig: o, moved: false };
    svgRef.current!.setPointerCapture(e.pointerId);
    tab.value = TAB_FOR[kind];
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const g = geom(plan.value.room, plan.value.sheet);
    const p = svgPt(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    // мелкое дрожание при клике — не перемещение
    if (Math.abs(dx) + Math.abs(dy) < 0.4 && !d.moved) return;
    d.moved = true;
    const q = d.orig;
    const onFloor = d.kind === 'it' || (d.kind === 'mk' && (q as Marker).place === 'floor');
    if (onFloor) {
      const qq = q as Item | Marker;
      const x = snap(qq.x.mm / 1000 + dx / g.s), y = snap(qq.y.mm / 1000 + dy / g.s);
      dispatch(pl => moveTo(pl, COL[d.kind], d.id, { x, y }), d.key);
      return;
    }
    const qq = q as WallItem | Marker;
    const sg = segOf(g, qq.wallId);
    if (!sg) return;
    const [doff, dz] = wallDelta(sg, dx, dy, g.s);
    const off = snap(Math.max(-1, Math.min(sg.len, qq.off.mm / 1000 + doff)));
    if (d.kind === 'wi' || (qq as Marker).place === 'wall') {
      const z = snap(Math.max(0, Math.min(g.h, qq.z.mm / 1000 + dz)));
      dispatch(pl => moveTo(pl, COL[d.kind], d.id, { off, z }), d.key);
    } else {
      dispatch(pl => moveTo(pl, COL[d.kind], d.id, { off }), d.key);
    }
  };

  const onUp = () => { drag.current = null; endGesture(); };

  return (
    <div class="stage" ref={stageRef}>
      <svg
        ref={svgRef}
        class="sheet"
        viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: base * zoom.value + 'px' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        dangerouslySetInnerHTML={{ __html: drawSheet(plan.value, { sel: sel.value }) }}
      />
      <div class="legendline">Перетаскивайте мебель, метки и элементы стен мышью. Точные значения правьте слева.</div>
    </div>
  );
}
