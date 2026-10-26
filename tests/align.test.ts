// Этап 12 (замечание проверки): окна и радиаторы на одной стене — на одной высоте.
import { describe, expect, test } from 'vitest';
import { addWallItem, alignItemsLine, alignLikeThis, itemsInLine, likeOnWall, patch, snapItemXY, snapWallZ } from '../src/model/actions';
import example from '../examples/auditorium.plan.json';
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

describe('мебель ровными рядами (этап 12)', () => {
  // учебная аудитория: парты 0,5 × 2,6 м колонками, x = 2,6 м; 3,45 м …
  const aud = (): Plan => structuredClone(example) as unknown as Plan;
  const desk = (p: Plan, id: string) => p.items.find(i => i.id === id)!;

  test('сдвинули парту на 5 см — встаёт на линию соседней, видна направляющая', () => {
    const r = snapItemXY(aud(), 'id028', 2650, 3920, 200);
    expect(r.x).toBe(2600);
    expect(r.gx).toBe(2600);
    expect(r.y).toBe(3900);
  });

  test('далеко от соседей — не прилипает', () => {
    const p = aud();
    const r = snapItemXY(p, 'id026', 30000, 30000, 50);
    expect(r).toEqual({ x: 30000, y: 30000, gx: null, gy: null });
  });

  test('повёрнутый вкось предмет не выравнивается', () => {
    const p = patch(aud(), 'items', 'id028', { angle: 30 });
    expect(snapItemXY(p, 'id028', 2650, 3920, 200)).toEqual({ x: 2650, y: 3920, gx: null, gy: null });
  });

  test('«Выровнять колонку по этому»: парты одной колонки — на одной линии, замеренные не трогаются', () => {
    let p = aud();
    expect(itemsInLine(p, 'id027', 'col').map(i => i.id)).toContain('id028');
    p = patch(p, 'items', 'id028', { x: cond(2680) });
    p = alignItemsLine(p, 'id027', 'col');
    expect(desk(p, 'id028').x.mm).toBe(2600);
    p = patch(p, 'items', 'id028', { x: { mm: 2680, status: 'measured', method: 'tape' } });
    expect(desk(alignItemsLine(p, 'id027', 'col'), 'id028').x.mm).toBe(2680);
  });

  test('«Выровнять ряд по этому»: только такие же предметы, стоящие в этом ряду', () => {
    const p = aud();
    const row = itemsInLine(p, 'id027', 'row');
    expect(row.length).toBeGreaterThan(0);
    expect(row.every(i => i.type === 'desk' && Math.abs(i.y.mm - 500) < 2600)).toBe(true);
    expect(row.map(i => i.id)).not.toContain('id028');
  });
});
