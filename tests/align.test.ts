// Этап 12 (замечание проверки): окна и радиаторы на одной стене — на одной высоте.
import { describe, expect, test } from 'vitest';
import { addWallItem, alignLikeThis, likeOnWall, patch, snapWallZ } from '../src/model/actions';
import { blank } from '../src/model/state';
import { cond } from '../src/model/units';
import type { Plan } from '../src/model/types';

/** три окна на стене А чуть вразнобой и радиатор */
function wall(): Plan {
  let p = blank();
  for (const [id, z, h] of [['w1', 900, 1500], ['w2', 950, 1400], ['w3', 880, 1520]] as const) {
    p = addWallItem(p, id, 'window', 'A');
    p = patch(p, 'wallItems', id, { z: cond(z), h: cond(h) });
  }
  return addWallItem(p, 'r1', 'radiator', 'A');
}

describe('выровнять такие же по этому', () => {
  test('окна стены — та же высота от пола и та же высота окна; радиатор не трогается', () => {
    const p = alignLikeThis(wall(), 'w1');
    const z = Object.fromEntries(p.wallItems.map(i => [i.id, [i.z.mm, i.h.mm]]));
    expect(z).toMatchObject({ w1: [900, 1500], w2: [900, 1500], w3: [900, 1500] });
    expect(z['r1']).toEqual([150, 600]);
    expect(likeOnWall(wall(), 'w1')).toBe(2);
  });

  test('замеренное окно не сдвигается', () => {
    let p = wall();
    p = patch(p, 'wallItems', 'w2', { z: { mm: 950, status: 'measured', method: 'tape' } });
    expect(alignLikeThis(p, 'w1').wallItems.find(i => i.id === 'w2')!.z.mm).toBe(950);
  });
});

describe('привязка по высоте при перетаскивании', () => {
  test('низ окна рядом с низом соседнего — встаёт ровно, видна линия', () => {
    expect(snapWallZ(wall(), 'w2', 'A', 905, 1400, 50)).toEqual({ z: 900, line: 900 });
  });
  test('середина по середине соседнего', () => {
    // середина w1 — 1650; окно высотой 1000 с z = 1160 — середина 1660
    expect(snapWallZ(wall(), 'x', 'A', 1160, 1000, 20)).toEqual({ z: 1150, line: 1650 });
  });
  test('далеко — без привязки', () => {
    expect(snapWallZ(wall(), 'w2', 'A', 2000, 300, 20)).toEqual({ z: 2000, line: null });
  });
});
