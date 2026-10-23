// Этап 9: гомография на известных точках.
import { describe, expect, test } from 'vitest';
import { applyH, homography, orderQuad, quadOk, type Pt2 } from '../src/geometry/homography';
import { outSize, warp } from '../src/photos/rectify';

const near = (p: Pt2, q: Pt2, digits = 6) => { expect(p.x).toBeCloseTo(q.x, digits); expect(p.y).toBeCloseTo(q.y, digits); };
const unit: Pt2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

describe('гомография', () => {
  test('углы переходят в углы', () => {
    const quad: Pt2[] = [{ x: 120, y: 80 }, { x: 900, y: 140 }, { x: 870, y: 700 }, { x: 150, y: 760 }];
    const h = homography(unit, quad)!;
    unit.forEach((p, i) => near(applyH(h, p.x, p.y), quad[i]!));
  });

  test('прямоугольник без перспективы — растяжение и сдвиг', () => {
    const h = homography(unit, [{ x: 10, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 40 }, { x: 10, y: 40 }])!;
    near(applyH(h, 0.5, 0.5), { x: 30, y: 30 });
    near(applyH(h, 0.25, 1), { x: 20, y: 40 });
  });

  test('перспектива: середина стены на снимке — точка пересечения диагоналей, а не середина отрезков', () => {
    // дальний край стены короче: левый край 0…600, правый 150…450
    const quad: Pt2[] = [{ x: 0, y: 0 }, { x: 800, y: 150 }, { x: 800, y: 450 }, { x: 0, y: 600 }];
    const h = homography(unit, quad)!;
    const c = applyH(h, 0.5, 0.5);
    // диагонали (0,0)-(800,450) и (800,150)-(0,600) пересекаются при x ≈ 533,3
    near(c, { x: 1600 / 3, y: 300 }, 4);
    expect(c.x).toBeGreaterThan(400);
  });

  test('обратный перевод: снимок → стена → снимок', () => {
    const quad: Pt2[] = [{ x: 31, y: 12 }, { x: 640, y: 55 }, { x: 610, y: 470 }, { x: 18, y: 430 }];
    const toPhoto = homography(unit, quad)!, toWall = homography(quad, unit)!;
    for (const p of [{ x: 0.1, y: 0.2 }, { x: 0.7, y: 0.9 }, { x: 0.5, y: 0.5 }]) {
      const q = applyH(toPhoto, p.x, p.y);
      near(applyH(toWall, q.x, q.y), p);
    }
  });

  test('три точки на одной прямой — нельзя', () => {
    expect(homography(unit, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 5 }])).toBeNull();
  });
});

describe('годится ли четырёхугольник', () => {
  test('углы по порядку — да', () => {
    expect(quadOk([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.2 }, { x: 0.85, y: 0.8 }, { x: 0.15, y: 0.9 }])).toBe(true);
  });
  test('перекрученный или против часовой — нет', () => {
    expect(quadOk([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.2 }, { x: 0.15, y: 0.9 }, { x: 0.85, y: 0.8 }])).toBe(false);
    expect(quadOk([{ x: 0.1, y: 0.1 }, { x: 0.15, y: 0.9 }, { x: 0.85, y: 0.8 }, { x: 0.9, y: 0.2 }])).toBe(false);
  });
});

describe('выпрямление картинки', () => {
  // снимок 40×30: белый фон, на нём чёрная «стена» — трапеция; внутри стены левая половина красная
  const W = 40, H = 30;
  const quad: Pt2[] = [{ x: 8, y: 4 }, { x: 34, y: 8 }, { x: 34, y: 22 }, { x: 8, y: 26 }];
  const toWall = homography(quad, unit)!;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = applyH(toWall, x + 0.5, y + 0.5), o = (y * W + x) * 4;
    const inside = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    data[o] = !inside ? 255 : p.x < 0.5 ? 255 : 0; data[o + 1] = inside ? 0 : 255; data[o + 2] = inside ? 0 : 255; data[o + 3] = 255;
  }

  test('размер: высота — как у кадра, ширина — по соотношению сторон стены', () => {
    expect(outSize(quad, 2)).toEqual({ w: 36, h: 18 });
    // большой кадр уменьшается до предела по большей стороне
    expect(outSize([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }], 3, 2048)).toEqual({ w: 2048, h: 683 });
  });

  test('трапеция становится прямоугольником: левая половина красная, правая чёрная', () => {
    const r = warp({ data, width: W, height: H }, quad, 20, 10)!;
    const px = (i: number, j: number) => [...r.data.slice((j * 20 + i) * 4, (j * 20 + i) * 4 + 3)];
    for (const j of [1, 5, 8]) {
      expect(px(3, j)).toEqual([255, 0, 0]);
      expect(px(16, j)).toEqual([0, 0, 0]);
    }
  });
});

describe('порядок углов', () => {
  const ok: Pt2[] = [{ x: 0.1, y: 0.15 }, { x: 0.92, y: 0.25 }, { x: 0.9, y: 0.8 }, { x: 0.12, y: 0.9 }];
  test.each([[0, 1, 2, 3], [2, 0, 3, 1], [3, 2, 1, 0], [1, 3, 0, 2]])('отмечены в порядке %i %i %i %i', (...idx) => {
    expect(orderQuad(idx.map(i => ok[i]!))).toEqual(ok);
    expect(quadOk(orderQuad(idx.map(i => ok[i]!)))).toBe(true);
  });
});
