// Помещение из отрезков и координаты развёртки на простом помещении 10 × 6 × 3 м.
import { describe, expect, test } from 'vitest';
import { createRectRoom, rectSize, wallLength } from '../src/model/room';
import { geom, segOf, unf, unfRect, wallDelta, wallPt, type Geom, type Seg } from '../src/geometry/unfold';
import type { SheetOptions } from '../src/model/types';

const room = createRectRoom(10_000, 6_000, 3_000);
const sheet = (o: Partial<SheetOptions> = {}): SheetOptions => ({ mode: 'scale', scale: 100, showDims: true, showTies: true, ...o });

// Масштаб 1:100 → 10 мм листа на 1 м; пол 100×60 мм, развёртка 160×120 мм в центре области 264×256
const g: Geom = geom(room, sheet());
const sg = (id: string): Seg => segOf(g, id)!;
const { fx, fy } = g;

describe('прямоугольник — 4 стены-отрезка', () => {
  test('по часовой стрелке от угла А/В', () => {
    expect(room.walls.map(w => [w.letter, w.a, w.b])).toEqual([
      ['А', { x: 0, y: 0 }, { x: 10000, y: 0 }],
      ['Г', { x: 10000, y: 0 }, { x: 10000, y: 6000 }],
      ['Б', { x: 10000, y: 6000 }, { x: 0, y: 6000 }],
      ['В', { x: 0, y: 6000 }, { x: 0, y: 0 }],
    ]);
  });

  test('отрезки замкнуты, длины совпадают с размерами', () => {
    room.walls.forEach((w, i) => expect(w.b).toEqual(room.walls[(i + 1) % 4]!.a));
    for (const w of room.walls) expect(wallLength(w)).toBe(w.length.mm);
    expect(rectSize(room).L.mm).toBe(10000);
    expect(rectSize(room).W.mm).toBe(6000);
  });

  test('нормаль каждой стены смотрит внутрь, развёртка — со своей стороны листа', () => {
    expect(['A', 'G', 'B', 'V'].map(id => [sg(id).nx + 0, sg(id).ny + 0, sg(id).side])).toEqual([
      [0, 1, 'top'], [-1, 0, 'right'], [0, -1, 'bottom'], [1, 0, 'left'],
    ]);
  });
});

describe('geom', () => {
  test('масштаб 1:100 и положение пола', () => {
    expect(g.s).toBe(10);
    expect(fx).toBe(24 + (264 - 160) / 2 + 30);
    expect(fy).toBe(28 + (256 - 120) / 2 + 30);
    expect(g.fits).toBe(true);
  });

  test('не помещается в 1:50', () => {
    expect(geom(room, sheet({ scale: 50 })).fits).toBe(false);
  });

  test('схематично — развёртка вписана в область', () => {
    const sgm = geom(room, sheet({ mode: 'schematic' }));
    expect(sgm.s).toBeCloseTo(Math.min(234 / 16, 226 / 12), 10);
    expect(sgm.fits).toBe(true);
  });
});

describe('wallPt — точка на стене, 2 м от левого угла (стоя лицом к стене)', () => {
  test.each<[string, [number, number]]>([
    ['A', [fx + 20, fy]],
    ['G', [fx + 100, fy + 20]],
    // Б идёт справа налево, В — снизу вверх
    ['B', [fx + 80, fy + 60]],
    ['V', [fx, fy + 40]],
  ])('стена %s', (id, p) => {
    const q = wallPt(g, sg(id), 2);
    expect(q[0]).toBeCloseTo(p[0], 10);
    expect(q[1]).toBeCloseTo(p[1], 10);
  });
});

describe('unf — точка на развёртке, 2 м вдоль и 1 м от пола', () => {
  test.each<[string, [number, number]]>([
    ['A', [fx + 20, fy - 10]],
    ['G', [fx + 110, fy + 20]],
    ['B', [fx + 80, fy + 70]],
    ['V', [fx - 10, fy + 40]],
  ])('стена %s: высота откладывается наружу от пола', (id, p) => {
    const q = unf(g, sg(id), 2, 1);
    expect(q[0]).toBeCloseTo(p[0], 10);
    expect(q[1]).toBeCloseTo(p[1], 10);
  });

  test('на высоте 0 точка развёртки лежит на линии стены', () => {
    for (const id of ['A', 'G', 'B', 'V']) expect(unf(g, sg(id), 3, 0)).toEqual(wallPt(g, sg(id), 3));
  });

  test('окно 1,5×1,8 м на стене А, 2 м от угла, низ на 0,9 м', () => {
    expect(unfRect(g, sg('A'), 2, 0.9, 1.5, 1.8)).toEqual({ x: fx + 20, y: fy - 27, w: 15, h: 18 });
  });

  test('на стене Б тот же участок отсчитывается от правого угла листа', () => {
    const r = unfRect(g, sg('B'), 2, 0, 1.5, 1);
    expect(r.x).toBeCloseTo(fx + 100 - 35, 10);
    expect(r.w).toBeCloseTo(15, 10);
    expect(r.y).toBeCloseTo(fy + 60, 10);
  });
});

describe('wallDelta — перетаскивание по развёртке', () => {
  test('сдвиг мыши переводится обратно в «вдоль стены» и «вверх»', () => {
    for (const id of ['A', 'G', 'B', 'V']) {
      const a = unf(g, sg(id), 2, 1), b = unf(g, sg(id), 3, 1.5);
      const [doff, dz] = wallDelta(sg(id), b[0] - a[0], b[1] - a[1], g.s);
      expect(doff).toBeCloseTo(1, 10);
      expect(dz).toBeCloseTo(0.5, 10);
    }
  });
});
