// Геометрия развёртки по списку стен-отрезков: пол в центре, каждая стена
// «откинута» наружу от своего отрезка. Координаты листа — в мм листа (A3 420×297),
// размеры помещения здесь — в метрах (из миллиметров модели).
import type { Room, SheetOptions, Wall } from '../model/types';
import { roomExtent } from '../model/room';
import { toM } from '../model/units';

export type Pt = [number, number];

/** Стена для рисования: отрезок в метрах, направление и нормаль внутрь */
export interface Seg {
  wall: Wall;
  ax: number;
  ay: number;
  len: number;
  /** единичный вектор от начала к концу */
  ux: number;
  uy: number;
  /** единичная нормаль внутрь помещения (справа от направления) */
  nx: number;
  ny: number;
  /** с какой стороны пола лежит развёртка этой стены на листе */
  side: 'top' | 'right' | 'bottom' | 'left';
}

export interface Geom {
  /** габарит пола, м */
  L: number;
  W: number;
  h: number;
  /** мм листа на 1 м */
  s: number;
  /** толщина стен на листе, мм: развёртка откидывается от наружной грани стены (как в образце) */
  t: number;
  /** точка начала координат пола на листе */
  fx: number;
  fy: number;
  /** помещается ли развёртка в область чертежа */
  fits: boolean;
  segs: Seg[];
  /** стены соседних помещений — только на плане пола, без развёрток (этап 12) */
  annexSegs: Seg[][];
  /** стены-перегородки основного помещения: к ним примыкает соседнее — развёртка легла бы на его пол */
  noUnfold: ReadonlySet<string>;
}

/** Прямоугольник на листе, мм */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Масштабы режима «В масштабе», от крупного к мелкому */
export const SCALES = [50, 100, 200] as const;

const PAD = 15;

/** Толщина стен на плане, м — одна на помещение, только для вида (decisions.md, этап 12) */
export const WALL_T = 0.25;

function sideOf(nx: number, ny: number): Seg['side'] {
  // развёртка лежит снаружи, т. е. против нормали внутрь
  if (Math.abs(ny) >= Math.abs(nx)) return ny > 0 ? 'top' : 'bottom';
  return nx < 0 ? 'right' : 'left';
}

export function toSeg(w: Wall): Seg {
  const ax = toM(w.a.x), ay = toM(w.a.y);
  const dx = toM(w.b.x) - ax, dy = toM(w.b.y) - ay;
  const len = Math.hypot(dx, dy);
  const ux = len ? dx / len : 1, uy = len ? dy / len : 0;
  // поворот на 90° «вправо» при оси Y вниз
  const nx = -uy, ny = ux;
  return { wall: w, ax, ay, len, ux, uy, nx, ny, side: sideOf(nx, ny) };
}

/** Стены соседних помещений (у них свои стены, высота — общая) */
type Annexes = readonly { walls: Wall[] }[];

/** Габарит развёртки, м: пол плюс высота стены во все стороны; соседние помещения — без развёрток */
function unfoldedSize(room: Room, annexes: Annexes = []) {
  const e = roomExtent(room);
  const h = toM(room.height.mm), o = h + WALL_T;
  let minX = toM(e.minX) - o, maxX = toM(e.maxX) + o, minY = toM(e.minY) - o, maxY = toM(e.maxY) + o;
  for (const a of annexes) {
    for (const w of a.walls) {
      minX = Math.min(minX, toM(w.a.x)); maxX = Math.max(maxX, toM(w.a.x));
      minY = Math.min(minY, toM(w.a.y)); maxY = Math.max(maxY, toM(w.a.y));
    }
  }
  return { e, h, minX, minY, totW: maxX - minX, totH: maxY - minY };
}

/** Помещается ли развёртка в область листа в масштабе 1:scale */
export function fitsAt(room: Room, area: Area, scale: number, annexes: Annexes = []): boolean {
  const { totW, totH } = unfoldedSize(room, annexes), s = 1000 / scale;
  return totW * s <= area.w - 2 * PAD + 0.01 && totH * s <= area.h - 2 * PAD + 0.01;
}

/** Ближайший более мелкий масштаб, в котором план помещается; null — не помещается ни в каком */
export function smallerScaleThatFits(room: Room, area: Area, scale: number, annexes: Annexes = []): number | null {
  return SCALES.find(k => k > scale && fitsAt(room, area, k, annexes)) ?? null;
}

export function geom(room: Room, sheet: SheetOptions, area: Area, annexes: Annexes = []): Geom {
  const segs = room.walls.map(toSeg);
  const annexSegs = annexes.map(a => a.walls.map(toSeg));
  if (!segs.length) {
    // чистый лист (этап 12): масштаб для рисования — 1:100 (или масштаб листа), начало координат — середина чертежа
    const k = 1000 / (sheet.mode === 'scale' ? sheet.scale : 100);
    return { L: 0, W: 0, h: toM(room.height.mm), s: k, t: WALL_T * k, fx: area.x + area.w / 2, fy: area.y + area.h / 2, fits: true, segs, annexSegs, noUnfold: new Set() };
  }
  const { e, h, minX, minY, totW, totH } = unfoldedSize(room, annexes);
  const pad = PAD;
  const s = sheet.mode === 'scale' ? 1000 / sheet.scale : Math.min((area.w - 2 * pad) / totW, (area.h - 2 * pad) / totH);
  const fits = totW * s <= area.w - 2 * pad + 0.01 && totH * s <= area.h - 2 * pad + 0.01;
  const fx = area.x + (area.w - totW * s) / 2 - minX * s, fy = area.y + (area.h - totH * s) / 2 - minY * s;
  const noUnfold = new Set(segs.filter(sg => annexSegs.some(a => a.some(o => touches(sg, o)))).map(sg => sg.wall.id));
  return { L: toM(e.maxX - e.minX), W: toM(e.maxY - e.minY), h, s, t: WALL_T * s, fx, fy, fits, segs, annexSegs, noUnfold };
}

/** Стена основного помещения с развёрткой; у перегородки к соседнему помещению развёртки нет */
export function segOf(g: Geom, wallId: string): Seg | undefined {
  return g.noUnfold.has(wallId) ? undefined : g.segs.find(sg => sg.wall.id === wallId);
}

/** Две стены на одной линии и перекрываются по длине — общая стена-перегородка */
function touches(a: Seg, b: Seg): boolean {
  const cross = (x: number, y: number) => a.ux * (y - a.ay) - a.uy * (x - a.ax);
  const bx = b.ax + b.ux * b.len, by = b.ay + b.uy * b.len;
  if (Math.abs(cross(b.ax, b.ay)) > 1e-3 || Math.abs(cross(bx, by)) > 1e-3) return false;
  const t1 = (b.ax - a.ax) * a.ux + (b.ay - a.ay) * a.uy, t2 = (bx - a.ax) * a.ux + (by - a.ay) * a.uy;
  return Math.min(a.len, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)) > 1e-3;
}

/** Стена на плане пола: основного помещения или соседнего (окна и двери рисуются и там) */
export function planSegOf(g: Geom, wallId: string): Seg | undefined {
  return [...g.segs, ...g.annexSegs.flat()].find(sg => sg.wall.id === wallId);
}

/** Точка пола (м) → лист */
export const floorPt = (g: Geom, x: number, y: number): Pt => [g.fx + x * g.s, g.fy + y * g.s];

/** Точка на линии стены в плане пола, t — от начала стены, м */
export function wallPt(g: Geom, sg: Seg, t: number): Pt {
  return floorPt(g, sg.ax + sg.ux * t, sg.ay + sg.uy * t);
}

export const inward = (sg: Seg): Pt => [sg.nx, sg.ny];
export const outward = (sg: Seg): Pt => [-sg.nx, -sg.ny];

/** Точка на развёртке стены: off — вдоль стены от её начала, z — от пола, м; пол развёртки — у наружной грани стены */
export function unf(g: Geom, sg: Seg, off: number, z: number): Pt {
  const p = wallPt(g, sg, off), d = z * g.s + g.t;
  return [p[0] - sg.nx * d, p[1] - sg.ny * d];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function unfRect(g: Geom, sg: Seg, off: number, z: number, len: number, eh: number): Rect {
  const a = unf(g, sg, off, z), b = unf(g, sg, off + len, z + eh);
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

/** Сдвиг мыши на листе (мм листа) → сдвиг вдоль стены и вверх по стене (м) */
export function wallDelta(sg: Seg, dx: number, dy: number, s: number): Pt {
  return [(dx * sg.ux + dy * sg.uy) / s, -(dx * sg.nx + dy * sg.ny) / s];
}

/** Место на плане, куда коснулись: пол (мм от начала координат) или развёртка стены */
export type Spot =
  | { place: 'floor'; x: number; y: number }
  | { place: 'wall'; wallId: string; off: number; z: number };

/** Точка внутри многоугольника пола (лучом вправо) */
function inFloor(segs: Seg[], x: number, y: number): boolean {
  let inside = false;
  for (const sg of segs) {
    const x1 = sg.ax, y1 = sg.ay, x2 = sg.ax + sg.ux * sg.len, y2 = sg.ay + sg.uy * sg.len;
    if ((y1 > y) !== (y2 > y) && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
  }
  return inside;
}

/**
 * Точка листа (мм листа) → место на плане: «новая метка — касанием плана» (этап 8).
 * Вне пола и вне развёрток — null.
 */
export function locate(g: Geom, px: number, py: number): Spot | null {
  const x = (px - g.fx) / g.s, y = (py - g.fy) / g.s;
  const mm = (m: number) => Math.round(m * 1000);
  if (inFloor(g.segs, x, y) || g.annexSegs.some(a => inFloor(a, x, y))) return { place: 'floor', x: mm(x), y: mm(y) };
  for (const sg of g.segs) {
    if (g.noUnfold.has(sg.wall.id)) continue;
    const o = unf(g, sg, 0, 0);
    const [off, z] = wallDelta(sg, px - o[0], py - o[1], g.s);
    if (off >= 0 && off <= sg.len && z >= 0 && z <= g.h) return { place: 'wall', wallId: sg.wall.id, off: mm(off), z: mm(z) };
  }
  return null;
}

/** Поворот подписи на развёртке, чтобы текст читался (не вверх ногами) */
export function textRot(sg: Seg): number {
  return sg.side === 'left' ? -90 : sg.side === 'right' ? 90 : 0;
}
