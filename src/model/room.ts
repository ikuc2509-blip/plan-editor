// Помещение как список стен-отрезков.
import type { Dim, Mm, Point, Room, Wall } from './types';
import { cond } from './units';

/** Порядок обхода прямоугольника по часовой стрелке: сверху, справа, снизу, слева */
export const RECT_WALLS = [
  { id: 'A', letter: 'А' },
  { id: 'G', letter: 'Г' },
  { id: 'B', letter: 'Б' },
  { id: 'V', letter: 'В' },
] as const;

/** Прямоугольное помещение L × W: четыре стены от угла А/В по часовой стрелке */
export function rectWalls(L: Dim, W: Dim, names: Partial<Record<string, string>> = {}): Wall[] {
  const l = L.mm, w = W.mm;
  const corners = [{ x: 0, y: 0 }, { x: l, y: 0 }, { x: l, y: w }, { x: 0, y: w }];
  return RECT_WALLS.map((rw, i) => ({
    id: rw.id,
    letter: rw.letter,
    name: names[rw.id] ?? '',
    a: corners[i]!,
    b: corners[(i + 1) % 4]!,
    length: i % 2 === 0 ? { ...L } : { ...W },
  }));
}

export function createRectRoom(L: Mm, W: Mm, h: Mm): Room {
  return { walls: rectWalls(cond(L), cond(W)), height: cond(h) };
}

export const wallLength = (w: Wall): Mm => Math.round(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y));

/** Габарит пола: для прямоугольника — L × W */
export function roomExtent(room: Room): { minX: Mm; minY: Mm; maxX: Mm; maxY: Mm } {
  // чистый лист: комнаты нет
  if (!room.walls.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = room.walls.flatMap(w => [w.a.x, w.b.x]), ys = room.walls.flatMap(w => [w.a.y, w.b.y]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Длина L и ширина W прямоугольника — это стены А и Г */
export function rectSize(room: Room): { L: Dim; W: Dim } {
  const a = room.walls.find(w => w.id === 'A'), g = room.walls.find(w => w.id === 'G');
  if (!a || !g) throw new Error('Помещение не прямоугольное');
  return { L: a.length, W: g.length };
}

export const findWall = (room: Room, id: string): Wall | undefined => room.walls.find(w => w.id === id);

/** Название соседнего помещения на листе и в списках: «подсобка» или «Помещение 2» */
export const annexName = (p: { annexes: readonly { id: string; name: string }[] }, id: string): string => {
  const i = p.annexes.findIndex(a => a.id === id);
  return p.annexes[i]?.name.trim() || `Помещение ${i + 2}`;
};

/** Стены в порядке букв (А, Б, В, Г) — для списков и рисования */
export const wallsByLetter = (room: Room): Wall[] =>
  [...room.walls].sort((p, q) => p.letter.localeCompare(q.letter, 'ru'));

/* ——— своя комната (этап 12) ——— */

/** Прямоугольник из заготовки: стены А, Г, Б, В по осям — для него есть L и W */
export function isRect(room: Room): boolean {
  if (room.walls.length !== 4) return false;
  const ids = RECT_WALLS.map(r => r.id);
  return room.walls.every((w, i) => w.id === ids[i] && (w.a.x === w.b.x || w.a.y === w.b.y));
}

/** L и W прямоугольника; у нарисованной комнаты их нет */
export const rectSizeOf = (room: Room): { L: Dim; W: Dim } | null => (isRect(room) ? rectSize(room) : null);

/** Комнаты ещё нет — чистый лист */
export const noRoom = (room: Room): boolean => room.walls.length === 0;

/** Буквы стен нарисованной комнаты по порядку */
export const LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ';

/** Удвоенная площадь со знаком: больше нуля — обход по часовой стрелке на листе (ось Y вниз) */
export function signedArea2(pts: readonly Point[]): number {
  let s = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]!; s += p.x * q.y - q.x * p.y; });
  return s;
}

/**
 * Углы нарисованной комнаты → стены. Обход — по часовой стрелке (помещение справа от стены),
 * первая стена «А» — верхняя левая. normalize — начало координат в левый верхний угол габарита
 * (для новой комнаты; у достроенной координаты не сдвигаются — мебель и метки остаются на местах).
 */
export function polygonWalls(pts: readonly Point[], normalize = true): Wall[] {
  let q = pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  // подряд одинаковые точки и точки на одной прямой — лишние углы
  q = q.filter((p, i) => { const n = q[(i + 1) % q.length]!; return p.x !== n.x || p.y !== n.y; });
  q = q.filter((p, i) => {
    const a = q[(i - 1 + q.length) % q.length]!, b = q[(i + 1) % q.length]!;
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) !== 0;
  });
  if (q.length < 3) return [];
  if (signedArea2(q) < 0) q.reverse();
  if (normalize) {
    const minX = Math.min(...q.map(p => p.x)), minY = Math.min(...q.map(p => p.y));
    q = q.map(p => ({ x: p.x - minX, y: p.y - minY }));
  }
  // стена А — с самой верхней серединой, при равенстве — левее
  const mid = (i: number) => ({ x: (q[i]!.x + q[(i + 1) % q.length]!.x) / 2, y: (q[i]!.y + q[(i + 1) % q.length]!.y) / 2 });
  let first = 0;
  q.forEach((_, i) => { const m = mid(i), f = mid(first); if (m.y < f.y || (m.y === f.y && m.x < f.x)) first = i; });
  q = [...q.slice(first), ...q.slice(0, first)];
  return q.map((a, i) => {
    const b = q[(i + 1) % q.length]!;
    return {
      id: 'w' + (i + 1), letter: LETTERS[i] ?? String(i + 1), name: '', a, b,
      length: cond(Math.round(Math.hypot(b.x - a.x, b.y - a.y))),
    };
  });
}

/** Углы комнаты по порядку обхода (начало каждой стены) */
export const roomCorners = (room: Room): Point[] => room.walls.map(w => w.a);
