// Гомография — перевод точек плоскости стены со снимка под углом в ровный прямоугольник
// (этап 9, без OpenCV). Матрица 3×3 по строкам, h[8] = 1.

export type Pt2 = { x: number; y: number };
export type H = readonly number[];

/** Решение системы n×n методом Гаусса с выбором главного элемента; null — точки вырождены */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    if (Math.abs(m[piv]![c]!) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = m[r]![c]! / m[c]![c]!;
      if (k) for (let j = c; j <= n; j++) m[r]![j]! -= k * m[c]![j]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Есть ли среди четырёх точек три на одной прямой (по площади треугольника относительно размера) */
function degenerate(q: readonly Pt2[]): boolean {
  const size = Math.max(...q.map(p => Math.abs(p.x)), ...q.map(p => Math.abs(p.y)), 1e-9);
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [q[i]!, q[(i + 1) % 4]!, q[(i + 2) % 4]!];
    if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-9 * size * size) return true;
  }
  return false;
}

/** Гомография, переводящая четыре точки src в четыре точки dst; null — три точки на одной прямой */
export function homography(src: readonly Pt2[], dst: readonly Pt2[]): H | null {
  if (degenerate(src) || degenerate(dst)) return null;
  const a: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!, { x: u, y: v } = dst[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(a, b);
  return h ? [...h, 1] : null;
}

export function applyH(h: H, x: number, y: number): Pt2 {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return { x: (h[0]! * x + h[1]! * y + h[2]!) / w, y: (h[3]! * x + h[4]! * y + h[5]!) / w };
}

/**
 * Четырёхугольник годится для выпрямления: выпуклый, углы по часовой стрелке
 * (на экране, ось Y вниз): вверху слева, вверху справа, внизу справа, внизу слева.
 */
export function quadOk(q: readonly Pt2[]): boolean {
  if (q.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!, c = q[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross <= 0) return false;
  }
  return true;
}

/**
 * Четыре точки в порядке «вверху слева, вверху справа, внизу справа, внизу слева» —
 * в каком бы порядке их ни отметили: по углу вокруг центра, первая — ближайшая к левому верху.
 */
export function orderQuad(q: readonly Pt2[]): Pt2[] {
  const cx = q.reduce((s, p) => s + p.x, 0) / q.length, cy = q.reduce((s, p) => s + p.y, 0) / q.length;
  // ось Y вниз: рост угла — по часовой стрелке на экране
  const byAngle = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let first = 0;
  byAngle.forEach((p, i) => { if (p.x + p.y < byAngle[first]!.x + byAngle[first]!.y) first = i; });
  return [...byAngle.slice(first), ...byAngle.slice(0, first)];
}

/**
 * Углы из окна «Выпрямить»: когда отмечены все четыре — всегда по порядку «вверху слева …».
 * Обход по кругу, начатый не с левого верхнего угла, тоже даёт правильный четырёхугольник,
 * но кадр вышел бы повёрнутым (верх кадра — всегда потолок).
 */
export const tidyQuad = <T extends Pt2>(q: readonly T[]): T[] => (q.length === 4 ? orderQuad(q) as T[] : [...q]);
