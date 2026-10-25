// Рисование комнаты щелчками (этап 12): куда встанет угол — привязка к сетке и прямым углам.
// Координаты — мм пола; без DOM, проверяется тестами.
import type { Mm, Point } from '../model/types';

export interface SnapOpts {
  /** шаг сетки, мм; 0 — без сетки */
  step: Mm;
  /** без привязки к прямым углам (Shift) */
  free: boolean;
  /** на каком расстоянии, мм, угол «прилипает» к первому углу и к его линиям */
  tol: Mm;
}

const grid = (v: number, step: Mm) => (step > 0 ? Math.round(v / step) * step : Math.round(v));

/**
 * Следующий угол: от предыдущего — строго по горизонтали или вертикали (что ближе к движению),
 * длина — по шагу сетки; рядом с первым углом или с его линиями — точно на них (так комната замыкается ровно).
 */
export function snapCorner(pts: readonly Point[], raw: Point, o: SnapOpts): Point {
  const prev = pts[pts.length - 1], first = pts[0];
  let p = { x: grid(raw.x, o.step), y: grid(raw.y, o.step) };
  if (prev && !o.free) {
    // вдоль большей составляющей; длина — по сетке от предыдущего угла
    p = Math.abs(raw.x - prev.x) >= Math.abs(raw.y - prev.y)
      ? { x: prev.x + grid(raw.x - prev.x, o.step), y: prev.y }
      : { x: prev.x, y: prev.y + grid(raw.y - prev.y, o.step) };
  }
  if (first && pts.length >= 2) {
    if (Math.hypot(p.x - first.x, p.y - first.y) <= o.tol) return { ...first };
    // по линии первого угла — чтобы последняя стена легла ровно
    if (prev && !o.free) {
      if (p.y === prev.y && Math.abs(p.x - first.x) <= o.tol) p = { x: first.x, y: p.y };
      if (p.x === prev.x && Math.abs(p.y - first.y) <= o.tol) p = { x: p.x, y: first.y };
    }
  }
  return p;
}

/** Угол совпал с первым — комната замкнута */
export const closes = (pts: readonly Point[], p: Point): boolean =>
  pts.length >= 3 && p.x === pts[0]!.x && p.y === pts[0]!.y;
