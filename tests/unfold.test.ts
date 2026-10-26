// Помещение из отрезков и координаты развёртки на простом помещении 10 × 6 × 3 м.
import { describe, expect, test } from 'vitest';
import { createRectRoom, rectSize, wallLength } from '../src/model/room';
import { fitsAt, geom, locate, segOf, smallerScaleThatFits, unf, unfRect, wallDelta, wallPt, type Geom, type Seg } from '../src/geometry/unfold';
import { layoutFor } from '../src/render/layout';
import type { SheetOptions } from '../src/model/types';

const room = createRectRoom(10_000, 6_000, 3_000);
const sheet = (o: Partial<SheetOptions> = {}): SheetOptions => ({ paper: 'A3', mode: 'scale', scale: 100, showTies: true, bw: false, ...o });
const A3 = layoutFor('A3').area, A4 = layoutFor('A4').area;

// Масштаб 1:100 → 10 мм листа на 1 м; пол 100×60 мм, стены по 2,5 мм (0,25 м), развёртка 165×125 мм в центре области 264×256
const g: Geom = geom(room, sheet(), A3);
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
    expect(g.t).toBe(2.5);
    expect(fx).toBe(24 + (264 - 165) / 2 + 32.5);
    expect(fy).toBe(28 + (256 - 125) / 2 + 32.5);
    expect(g.fits).toBe(true);
  });

  test('не помещается в 1:50', () => {
    expect(geom(room, sheet({ scale: 50 }), A3).fits).toBe(false);
  });

  test('схематично — развёртка вписана в область', () => {
    const sgm = geom(room, sheet({ mode: 'schematic' }), A3);
    expect(sgm.s).toBeCloseTo(Math.min(234 / 16.5, 226 / 12.5), 10);
    expect(sgm.fits).toBe(true);
  });
});

describe('подбор масштаба', () => {
  // развёртка 16 × 12 м; область A3 264×256, A4 176×169, по 15 мм отступа с каждой стороны
  test('A3: 1:100 помещается, 1:50 — нет', () => {
    expect(fitsAt(room, A3, 100)).toBe(true);
    expect(fitsAt(room, A3, 50)).toBe(false);
  });

  test('A4: 1:100 не помещается (160 мм > 146 мм), предлагается 1:200', () => {
    expect(fitsAt(room, A4, 100)).toBe(false);
    expect(smallerScaleThatFits(room, A4, 100)).toBe(200);
  });

  test('из 1:50 на A3 предлагается ближайший подходящий — 1:100', () => {
    expect(smallerScaleThatFits(room, A3, 50)).toBe(100);
  });

  test('огромное помещение не помещается ни в каком масштабе', () => {
    expect(smallerScaleThatFits(createRectRoom(60_000, 40_000, 3_000), A4, 100)).toBeNull();
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
    ['A', [fx + 20, fy - 12.5]],
    ['G', [fx + 112.5, fy + 20]],
    ['B', [fx + 80, fy + 72.5]],
    ['V', [fx - 12.5, fy + 40]],
  ])('стена %s: высота откладывается наружу от наружной грани стены', (id, p) => {
    const q = unf(g, sg(id), 2, 1);
    expect(q[0]).toBeCloseTo(p[0], 10);
    expect(q[1]).toBeCloseTo(p[1], 10);
  });

  test('на высоте 0 точка развёртки — у наружной грани стены, на толщину стены от её линии', () => {
    for (const id of ['A', 'G', 'B', 'V']) {
      const a = unf(g, sg(id), 3, 0), b = wallPt(g, sg(id), 3);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(g.t, 10);
    }
  });

  test('окно 1,5×1,8 м на стене А, 2 м от угла, низ на 0,9 м', () => {
    expect(unfRect(g, sg('A'), 2, 0.9, 1.5, 1.8)).toEqual({ x: fx + 20, y: fy - 29.5, w: 15, h: 18 });
  });

  test('на стене Б тот же участок отсчитывается от правого угла листа', () => {
    const r = unfRect(g, sg('B'), 2, 0, 1.5, 1);
    expect(r.x).toBeCloseTo(fx + 100 - 35, 10);
    expect(r.w).toBeCloseTo(15, 10);
    expect(r.y).toBeCloseTo(fy + 62.5, 10);
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

describe('locate — куда коснулись на плане (новая метка, этап 8)', () => {
  test('пол: точка листа переводится в мм от угла помещения', () => {
    expect(locate(g, fx + 25, fy + 40)).toEqual({ place: 'floor', x: 2500, y: 4000 });
  });

  test.each(['A', 'G', 'B', 'V'])('стена %s: обратно к отступу и высоте', id => {
    const p = unf(g, sg(id), 2, 1);
    expect(locate(g, p[0], p[1])).toEqual({ place: 'wall', wallId: id, off: 2000, z: 1000 });
  });

  test('вне пола и развёрток — ничего', () => {
    // угол между развёртками А и В
    expect(locate(g, fx - 10, fy - 10)).toBeNull();
    // дальше высоты стены
    expect(locate(g, fx + 50, fy - 40)).toBeNull();
  });
});
