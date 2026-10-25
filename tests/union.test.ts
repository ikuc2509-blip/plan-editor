// Этап 12: фигуры — прямоугольник, приставленный к комнате, сливается с ней.
import { describe, expect, test } from 'vitest';
import { rectPts, unionOrtho } from '../src/geometry/union';
import { polygonWalls } from '../src/model/room';

const R = (x0: number, y0: number, x1: number, y1: number) => rectPts({ x: x0, y: y0 }, { x: x1, y: y1 });

describe('слияние прямоугольников', () => {
  test('один прямоугольник — он сам', () => {
    const r = unionOrtho([R(0, 0, 4000, 3000)]);
    expect(r).toEqual({ ok: true, pts: R(0, 0, 4000, 3000) });
  });

  test('приставлен снизу слева — Г-образная комната из шести стен', () => {
    const r = unionOrtho([R(0, 0, 6000, 3000), R(0, 3000, 4000, 5000)]);
    expect(r.ok).toBe(true);
    const walls = polygonWalls(r.ok ? r.pts : []);
    expect(walls.map(w => w.length.mm)).toEqual([6000, 3000, 2000, 2000, 4000, 5000]);
  });

  test('ниша: маленький прямоугольник посередине стены — восемь стен', () => {
    const r = unionOrtho([R(0, 0, 6000, 4000), R(2000, 4000, 3500, 4800)]);
    expect(r.ok && r.pts).toHaveLength(8);
  });

  test('внутри комнаты — ничего не меняется; перекрытие — тоже сливается', () => {
    expect(unionOrtho([R(0, 0, 6000, 4000), R(1000, 1000, 2000, 2000)])).toEqual({ ok: true, pts: R(0, 0, 6000, 4000) });
    const r = unionOrtho([R(0, 0, 6000, 4000), R(5000, 1000, 8000, 3000)]);
    expect(r.ok && r.pts).toHaveLength(8);
  });

  test('не касаются, касаются углом, дыра, косая стена — понятный отказ', () => {
    expect(unionOrtho([R(0, 0, 2000, 2000), R(3000, 0, 5000, 2000)])).toEqual({ ok: false, why: 'apart' });
    expect(unionOrtho([R(0, 0, 2000, 2000), R(2000, 2000, 4000, 4000)])).toMatchObject({ ok: false });
    // кольцо из четырёх прямоугольников — дыра в середине
    expect(unionOrtho([R(0, 0, 6000, 1000), R(5000, 0, 6000, 6000), R(0, 5000, 6000, 6000), R(0, 0, 1000, 6000)])).toEqual({ ok: false, why: 'hole' });
    expect(unionOrtho([[{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 0, y: 3000 }]])).toEqual({ ok: false, why: 'slanted' });
  });
});
