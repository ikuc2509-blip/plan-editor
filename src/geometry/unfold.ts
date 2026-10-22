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
  /** точка начала координат пола на листе */
  fx: number;
  fy: number;
  /** помещается ли развёртка в область чертежа */
  fits: boolean;
  segs: Seg[];
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

/** Габарит развёртки, м: пол плюс высота стены во все стороны */
function unfoldedSize(room: Room) {
  const e = roomExtent(room);
  const h = toM(room.height.mm);
  const minX = toM(e.minX) - h, maxX = toM(e.maxX) + h, minY = toM(e.minY) - h, maxY = toM(e.maxY) + h;
  return { e, h, minX, minY, totW: maxX - minX, totH: maxY - minY };
}

/** Помещается ли развёртка в область листа в масштабе 1:scale */
export function fitsAt(room: Room, area: Area, scale: number): boolean {
  const { totW, totH } = unfoldedSize(room), s = 1000 / scale;
  return totW * s <= area.w - 2 * PAD + 0.01 && totH * s <= area.h - 2 * PAD + 0.01;
}

/** Ближайший более мелкий масштаб, в котором план помещается; null — не помещается ни в каком */
export function smallerScaleThatFits(room: Room, area: Area, scale: number): number | null {
  return SCALES.find(k => k > scale && fitsAt(room, area, k)) ?? null;
}

export function geom(room: Room, sheet: SheetOptions, area: Area): Geom {
  const segs = room.walls.map(toSeg);
  const { e, h, minX, minY, totW, totH } = unfoldedSize(room);
  const pad = PAD;
  const s = sheet.mode === 'scale' ? 1000 / sheet.scale : Math.min((area.w - 2 * pad) / totW, (area.h - 2 * pad) / totH);
  const fits = totW * s <= area.w - 2 * pad + 0.01 && totH * s <= area.h - 2 * pad + 0.01;
  const fx = area.x + (area.w - totW * s) / 2 - minX * s, fy = area.y + (area.h - totH * s) / 2 - minY * s;
  return { L: toM(e.maxX - e.minX), W: toM(e.maxY - e.minY), h, s, fx, fy, fits, segs };
}

export function segOf(g: Geom, wallId: string): Seg | undefined {
  return g.segs.find(sg => sg.wall.id === wallId);
}

/** Точка пола (м) → лист */
export const floorPt = (g: Geom, x: number, y: number): Pt => [g.fx + x * g.s, g.fy + y * g.s];

/** Точка на линии стены в плане пола, t — от начала стены, м */
export function wallPt(g: Geom, sg: Seg, t: number): Pt {
  return floorPt(g, sg.ax + sg.ux * t, sg.ay + sg.uy * t);
}

export const inward = (sg: Seg): Pt => [sg.nx, sg.ny];
export const outward = (sg: Seg): Pt => [-sg.nx, -sg.ny];

/** Точка на развёртке стены: off — вдоль стены от её начала, z — от пола, м */
export function unf(g: Geom, sg: Seg, off: number, z: number): Pt {
  const p = wallPt(g, sg, off);
  return [p[0] - sg.nx * z * g.s, p[1] - sg.ny * z * g.s];
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

/** Поворот подписи на развёртке, чтобы текст читался (не вверх ногами) */
export function textRot(sg: Seg): number {
  return sg.side === 'left' ? -90 : sg.side === 'right' ? 90 : 0;
}
