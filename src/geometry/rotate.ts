// Повёрнутые предметы: углы, ручка поворота, «прилипание» к прямым углам.
// Ось Y пола направлена вниз (от стены А), поэтому положительный угол — по часовой стрелке.
import type { Item, Mm } from '../model/types';

export interface Vec { x: number; y: number }

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Повернуть точку p вокруг c на deg градусов по часовой стрелке */
export function rotatePt(p: Vec, c: Vec, deg: number): Vec {
  const a = rad(deg), cos = Math.cos(a), sin = Math.sin(a);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Центр предмета, мм пола */
export const itemCenter = (it: Item): Vec => ({ x: it.x.mm + it.w.mm / 2, y: it.y.mm + it.d.mm / 2 });

/** Углы предмета после поворота, мм пола: левый верхний, правый верхний, правый нижний, левый нижний (до поворота) */
export function itemCorners(it: Item): Vec[] {
  const x = it.x.mm, y = it.y.mm, w = it.w.mm, d = it.d.mm, c = itemCenter(it);
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + d }, { x, y: y + d }].map(p => rotatePt(p, c, it.angle));
}

/**
 * Угол ручки поворота: ручка стоит над серединой верхней стороны, поэтому направление
 * «из центра вверх» — это 0°. Результат 0…360.
 */
export function angleFromHandle(c: Vec, pointer: Vec): number {
  const deg = (Math.atan2(pointer.y - c.y, pointer.x - c.x) * 180) / Math.PI + 90;
  return ((deg % 360) + 360) % 360;
}

/** Около 0°, 90°, 180°, 270° угол «прилипает» к прямому; иначе — до целого градуса */
export function snapAngle(deg: number, magnet = 3): number {
  const right = Math.round(deg / 90) * 90;
  const a = Math.abs(deg - right) <= magnet ? right : Math.round(deg);
  return ((a % 360) + 360) % 360;
}

/** Привязка длины к сетке; шаг 0 — без привязки (до миллиметра) */
export function snapMm(mm: number, step: Mm): Mm {
  return step > 0 ? Math.round(mm / step) * step : Math.round(mm);
}

/**
 * Шаг видимой сетки, мм пола: шаг привязки или крупнее (10 см, 50 см, 1 м), чтобы линии
 * на экране шли не чаще чем через minGap мм листа. s — мм листа на 1 м.
 */
export function gridLineStep(snap: Mm, s: number, minGap = 2.5): Mm | null {
  if (snap <= 0) return null;
  for (const k of [snap, 100, 500, 1000, 2000, 5000]) {
    if (k >= snap && k % snap === 0 && (k / 1000) * s >= minGap) return k;
  }
  return null;
}
