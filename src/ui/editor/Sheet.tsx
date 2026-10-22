// Лист на экране и перетаскивание объектов мышью или пальцем.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item, Marker, PlanState, SelKind, WallItem } from '../../model/types';
import { drawSheet, SHEET_H, SHEET_W } from '../../render/sheet';
import { geom, wallDelta, wallLen } from '../../geometry/unfold';
import { plan, sel, tab, update, zoom, type TabKey } from '../store';

const TAB_FOR: Record<SelKind, TabKey> = { wi: 'walls', it: 'items', mk: 'markers' };
const COL = { wi: 'wallItems', it: 'items', mk: 'markers' } as const;

/** Шаг привязки при перетаскивании — 5 см */
const snap = (v: number): number => Math.round(v * 20) / 20;

interface Drag {
  kind: SelKind;
  id: string;
  start: { x: number; y: number };
  orig: WallItem | Item | Marker;
  moved: boolean;
}

function findObj(s: PlanState, kind: SelKind, id: string): WallItem | Item | Marker | undefined {
  return (s[COL[kind]] as (WallItem | Item | Marker)[]).find(x => x.id === id);
}

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
    drag.current = { kind, id, start: svgPt(e), orig: { ...o }, moved: false };
    svgRef.current!.setPointerCapture(e.pointerId);
    tab.value = TAB_FOR[kind];
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const g = geom(plan.value.room);
    const p = svgPt(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    // мелкое дрожание при клике — не перемещение
    if (Math.abs(dx) + Math.abs(dy) < 0.4 && !d.moved) return;
    d.moved = true;
    update(s => {
      const o = findObj(s, d.kind, d.id);
      if (!o) return;
      const q = d.orig;
      if (d.kind === 'it' || (d.kind === 'mk' && (o as Marker).place === 'floor')) {
        const oo = o as Item | Marker, qq = q as Item | Marker;
        oo.x = snap(qq.x + dx / g.s); oo.y = snap(qq.y + dy / g.s);
      } else {
        const oo = o as WallItem | Marker, qq = q as WallItem | Marker;
        const [doff, dz] = wallDelta(oo.wall, dx, dy, g.s);
        oo.off = snap(Math.max(-1, Math.min(wallLen(g, oo.wall), qq.off + doff)));
        if (d.kind === 'wi' || (oo as Marker).place === 'wall') oo.z = snap(Math.max(0, Math.min(g.h, qq.z + dz)));
      }
    });
  };

  const onUp = () => { drag.current = null; };

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
