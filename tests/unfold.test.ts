// Координаты развёртки на простом помещении с удобными числами.
import { describe, expect, test } from 'vitest';
import { geom, unf, unfRect, wallDelta, wallPt, type Geom } from '../src/geometry/unfold';
import type { Room, WallKey } from '../src/model/types';

const room = (o: Partial<Room> = {}): Room => ({
  L: 10, W: 6, h: 3, mode: 'scale', scale: 100, showDims: true, showTies: true, ...o,
});

// Масштаб 1:100 → 10 мм листа на 1 м; пол 100×60 мм, развёртка 160×120 мм в центре области 264×256
const g: Geom = geom(room());

describe('geom', () => {
  test('масштаб 1:100 и положение пола', () => {
    expect(g.s).toBe(10);
    expect(g.fx).toBe(24 + (264 - 160) / 2 + 30);
    expect(g.fy).toBe(28 + (256 - 120) / 2 + 30);
    expect(g.fits).toBe(true);
  });

  test('не помещается в 1:50', () => {
    expect(geom(room({ scale: 50 })).fits).toBe(false);
  });

  test('схематично — развёртка вписана в область', () => {
    const sg = geom(room({ mode: 'schematic' }));
    // ширина 264−30 на 16 м и высота 256−30 на 12 м — берётся меньший масштаб
    expect(sg.s).toBeCloseTo(Math.min(234 / 16, 226 / 12), 10);
    expect(sg.fits).toBe(true);
  });
});

describe('wallPt — точка на линии стены в плане', () => {
  const { fx, fy } = g;
  test.each<[WallKey, number, [number, number]]>([
    ['A', 2, [fx + 20, fy]],
    ['B', 2, [fx + 20, fy + 60]],
    ['V', 2, [fx, fy + 20]],
    ['G', 2, [fx + 100, fy + 20]],
  ])('стена %s, 2 м от начала', (w, t, p) => {
    expect(wallPt(g, w, t)).toEqual(p);
  });
});

describe('unf — точка на развёртке стены', () => {
  const { fx, fy } = g;
  // 2 м вдоль стены, 1 м от пола: высота откладывается наружу от пола
  test.each<[WallKey, [number, number]]>([
    ['A', [fx + 20, fy - 10]],
    ['B', [fx + 20, fy + 60 + 10]],
    ['V', [fx - 10, fy + 20]],
    ['G', [fx + 100 + 10, fy + 20]],
  ])('стена %s', (w, p) => {
    expect(unf(g, w, 2, 1)).toEqual(p);
  });

  test('на высоте 0 точка развёртки лежит на линии стены', () => {
    for (const w of ['A', 'B', 'V', 'G'] as const) expect(unf(g, w, 3, 0)).toEqual(wallPt(g, w, 3));
  });

  test('прямоугольник окна на развёртке стены А', () => {
    // окно 1,5×1,8 м в 2 м от начала стены, низ на 0,9 м
    expect(unfRect(g, 'A', 2, 0.9, 1.5, 1.8)).toEqual({ x: g.fx + 20, y: g.fy - 27, w: 15, h: 18 });
  });

  test('прямоугольник на стене Г повёрнут: вдоль стены — по вертикали листа', () => {
    expect(unfRect(g, 'G', 1, 0, 2, 1)).toEqual({ x: g.fx + 100, y: g.fy + 10, w: 10, h: 20 });
  });
});

describe('wallDelta — перетаскивание по развёртке', () => {
  test('сдвиг мыши переводится обратно в «вдоль стены» и «вверх»', () => {
    for (const w of ['A', 'B', 'V', 'G'] as const) {
      const a = unf(g, w, 2, 1), b = unf(g, w, 3, 1.5);
      const [doff, dz] = wallDelta(w, b[0] - a[0], b[1] - a[1], g.s);
      expect(doff).toBeCloseTo(1, 10);
      expect(dz).toBeCloseTo(0.5, 10);
    }
  });
});
