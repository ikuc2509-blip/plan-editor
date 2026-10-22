// Геометрия развёртки: пол в центре, стены «откинуты» наружу.
// Координаты листа — в миллиметрах (лист A3 420×297), длины помещения — в метрах.
import type { Room, WallKey } from '../model/types';

export type Pt = [number, number];

export interface Geom {
  L: number;
  W: number;
  h: number;
  /** мм листа на 1 м */
  s: number;
  /** левый верхний угол пола на листе */
  fx: number;
  fy: number;
  /** помещается ли развёртка в область чертежа */
  fits: boolean;
}

/** Область чертежа на листе A3 (слева от колонки легенды) */
export const AREA = { x: 24, y: 28, w: 264, h: 256 } as const;
const PAD = 15;

export function geom(room: Room): Geom {
  const { L, W, h } = room;
  const area = AREA, pad = PAD;
  const totW = L + 2 * h, totH = W + 2 * h;
  const s = room.mode === 'scale' ? 1000 / room.scale : Math.min((area.w - 2 * pad) / totW, (area.h - 2 * pad) / totH);
  const fits = totW * s <= area.w - 2 * pad + 0.01 && totH * s <= area.h - 2 * pad + 0.01;
  const fx = area.x + (area.w - totW * s) / 2 + h * s, fy = area.y + (area.h - totH * s) / 2 + h * s;
  return { L, W, h, s, fx, fy, fits };
}

export const wallLen = (g: Geom, w: WallKey): number => (w === 'A' || w === 'B') ? g.L : g.W;

/** Точка на линии стены в плане пола, t — расстояние от начала стены, м */
export function wallPt(g: Geom, w: WallKey, t: number): Pt {
  const { fx, fy, s, L, W } = g;
  return w === 'A' ? [fx + t * s, fy] : w === 'B' ? [fx + t * s, fy + W * s] : w === 'V' ? [fx, fy + t * s] : [fx + L * s, fy + t * s];
}

/** Направление внутрь помещения от стены */
export const inward = (w: WallKey): Pt => w === 'A' ? [0, 1] : w === 'B' ? [0, -1] : w === 'V' ? [1, 0] : [-1, 0];

export const outward = (w: WallKey): Pt => { const i = inward(w); return [-i[0], -i[1]]; };

/** Точка на развёртке стены: off — вдоль стены, z — высота от пола, м */
export function unf(g: Geom, w: WallKey, off: number, z: number): Pt {
  const { fx, fy, s, L, W } = g;
  return w === 'A' ? [fx + off * s, fy - z * s] : w === 'B' ? [fx + off * s, fy + W * s + z * s] : w === 'V' ? [fx - z * s, fy + off * s] : [fx + L * s + z * s, fy + off * s];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function unfRect(g: Geom, w: WallKey, off: number, z: number, len: number, eh: number): Rect {
  const a = unf(g, w, off, z), b = unf(g, w, off + len, z + eh);
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

/** Сдвиг мыши на листе (мм) → сдвиг вдоль стены и по высоте (м) */
export function wallDelta(w: WallKey, dx: number, dy: number, s: number): Pt {
  return w === 'A' ? [dx / s, -dy / s] : w === 'B' ? [dx / s, dy / s] : w === 'V' ? [dy / s, -dx / s] : [dy / s, dx / s];
}
