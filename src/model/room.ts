// Помещение как список стен-отрезков.
import type { Dim, Mm, Room, Wall } from './types';
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

/** Стены в порядке букв (А, Б, В, Г) — для списков и рисования */
export const wallsByLetter = (room: Room): Wall[] =>
  [...room.walls].sort((p, q) => p.letter.localeCompare(q.letter, 'ru'));
