// Север по компасу телефона (этап 11). Телефон лежит экраном вверх, верхним краем к стене А;
// стена А на листе — сверху, поэтому стрелка севера на листе = минус направление на стену А.

/** Показания датчика: alpha — поворот вокруг вертикали против часовой от севера (Android, «абсолютные»);
 * webkitCompassHeading — сразу направление по часовой от севера (iPhone) */
export interface OrientationSample {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  webkitCompassHeading?: number;
}

/** Куда смотрит верхний край телефона: градусы по часовой от севера; null — показаний нет */
export function headingOf(s: OrientationSample): number | null {
  if (typeof s.webkitCompassHeading === 'number' && !isNaN(s.webkitCompassHeading)) return norm(s.webkitCompassHeading);
  return s.alpha === null ? null : norm(360 - s.alpha);
}

/** Телефон лежит достаточно ровно, чтобы верить показаниям */
export const isFlat = (s: OrientationSample, tol = 25): boolean => Math.abs(s.beta ?? 0) <= tol && Math.abs(s.gamma ?? 0) <= tol;

const norm = (deg: number): number => ((deg % 360) + 360) % 360;

/** Среднее направление: 350° и 10° дают 0°, а не 180° */
export function meanAngle(degs: readonly number[]): number | null {
  if (!degs.length) return null;
  let x = 0, y = 0;
  for (const d of degs) { x += Math.cos(d * Math.PI / 180); y += Math.sin(d * Math.PI / 180); }
  if (Math.hypot(x, y) < 1e-9) return null;
  return norm(Math.atan2(y, x) * 180 / Math.PI);
}

/** Стрелка севера на листе (0 — вверх, по часовой) по направлению на стену А; до 5° — точнее компас не даёт */
export function northArrow(headingToWallA: number): number {
  return norm(Math.round(norm(360 - headingToWallA) / 5) * 5);
}
