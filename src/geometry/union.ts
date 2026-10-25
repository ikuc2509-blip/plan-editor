// Фигуры (этап 12): прямоугольник, приставленный к комнате, сливается с ней в один контур.
// Только стены по осям (комната из прямоугольников); мм пола. Без DOM — проверяется тестами.
import type { Point } from '../model/types';

/** Точка внутри многоугольника (лучом вправо); на границе — как получится, поэтому проверяем середины клеток */
function inside(poly: readonly Point[], x: number, y: number): boolean {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) r = !r;
  }
  return r;
}

export const isOrtho = (poly: readonly Point[]): boolean =>
  poly.every((p, i) => { const q = poly[(i + 1) % poly.length]!; return p.x === q.x || p.y === q.y; });

export type UnionResult = { ok: true; pts: Point[] } | { ok: false; why: 'apart' | 'hole' | 'slanted' };

/**
 * Объединение многоугольников со стенами по осям: клетки между всеми встречающимися x и y,
 * закрашено — внутри хотя бы одного; граница закрашенного — новый контур.
 * apart — фигуры не касаются; hole — внутри получилась дыра; slanted — есть косые стены.
 */
export function unionOrtho(polys: readonly (readonly Point[])[]): UnionResult {
  if (polys.some(p => !isOrtho(p))) return { ok: false, why: 'slanted' };
  const xs = [...new Set(polys.flatMap(p => p.map(q => q.x)))].sort((a, b) => a - b);
  const ys = [...new Set(polys.flatMap(p => p.map(q => q.y)))].sort((a, b) => a - b);
  const W = xs.length - 1, H = ys.length - 1;
  const fill: boolean[][] = [];
  for (let j = 0; j < H; j++) {
    fill.push([]);
    for (let i = 0; i < W; i++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2, cy = (ys[j]! + ys[j + 1]!) / 2;
      fill[j]!.push(polys.some(p => inside(p, cx, cy)));
    }
  }
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && fill[j]![i]!;
  // связность закрашенных клеток (касание стороной)
  const cells: [number, number][] = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (on(i, j)) cells.push([i, j]);
  if (!cells.length) return { ok: false, why: 'apart' };
  const seen = new Set<string>([cells[0]!.join()]), stack = [cells[0]!];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = `${i + di},${j + dj}`;
      if (on(i + di, j + dj) && !seen.has(k)) { seen.add(k); stack.push([i + di, j + dj]); }
    }
  }
  if (seen.size !== cells.length) return { ok: false, why: 'apart' };
  // рёбра границы с обходом по часовой (ось Y вниз): закрашенное справа от направления
  const next = new Map<string, string>();
  const key = (i: number, j: number) => `${i},${j}`;
  const edge = (a: [number, number], b: [number, number]) => {
    if (next.has(key(...a))) next.set(key(...a) + '#', key(...b)); else next.set(key(...a), key(...b));
  };
  for (const [i, j] of cells) {
    if (!on(i, j - 1)) edge([i, j], [i + 1, j]);
    if (!on(i + 1, j)) edge([i + 1, j], [i + 1, j + 1]);
    if (!on(i, j + 1)) edge([i + 1, j + 1], [i, j + 1]);
    if (!on(i - 1, j)) edge([i, j + 1], [i, j]);
  }
  // два ребра из одной вершины — касание углами; дыры — лишние петли
  if ([...next.keys()].some(k => k.endsWith('#'))) return { ok: false, why: 'hole' };
  const start = next.keys().next().value!;
  const loop: string[] = [];
  let cur = start;
  do { loop.push(cur); cur = next.get(cur)!; } while (cur !== start && loop.length <= next.size);
  if (loop.length !== next.size) return { ok: false, why: 'hole' };
  const pts = loop.map(k => { const [i, j] = k.split(',').map(Number); return { x: xs[i!]!, y: ys[j!]! }; });
  // углы на прямой — лишние
  const out = pts.filter((p, n) => {
    const a = pts[(n - 1 + pts.length) % pts.length]!, b = pts[(n + 1) % pts.length]!;
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
  return { ok: true, pts: out };
}

/** Прямоугольник по двум противоположным углам — четыре угла по часовой */
export function rectPts(a: Point, b: Point): Point[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}
