// «Что за стеной» (формат 15): полоска с подписью между стеной и её развёрткой, как в учебниках.
import { describe, expect, test } from 'vitest';
import { createRectRoom } from '../src/model/room';
import { BAND_MM, ceilPt, geom, locate, segOf, unf, type Geom } from '../src/geometry/unfold';
import { layoutFor } from '../src/render/layout';
import { addAnnex, setWallBehind, setWallElev } from '../src/model/actions';
import { blank } from '../src/model/state';
import type { Room, SheetOptions } from '../src/model/types';
import { drawSheet } from '../src/render/sheet';

const sheet = (o: Partial<SheetOptions> = {}): SheetOptions => ({ paper: 'A3', mode: 'scale', scale: 100, showTies: true, bw: false, ...o });
const A3 = layoutFor('A3').area;
const withBehind = (room: Room, id: string, behind: string): Room => ({ ...room, walls: room.walls.map(w => (w.id === id ? { ...w, behind } : w)) });
const room = createRectRoom(10_000, 6_000, 3_000);

describe('поле «за стеной»', () => {
  test('вписали — хранится; стёрли — поля нет', () => {
    const p = setWallBehind(blank(), 'A', 'коридор');
    expect(p.room.walls.find(w => w.id === 'A')!.behind).toBe('коридор');
    expect('behind' in setWallBehind(p, 'A', '  ').room.walls.find(w => w.id === 'A')!).toBe(false);
  });
});

describe('развёртка отодвигается на полоску', () => {
  const plain: Geom = geom(room, sheet(), A3);
  const g: Geom = geom(withBehind(room, 'A', 'коридор'), sheet(), A3);

  test('у стены А полоска 6 мм листа (0,6 м в 1:100), у остальных нет', () => {
    expect(segOf(g, 'A')!.band * g.s).toBeCloseTo(BAND_MM, 6);
    expect(segOf(g, 'B')!.band).toBe(0);
  });

  test('низ развёртки А — на 6 мм дальше от стены, развёртка Б на месте', () => {
    expect(unf(g, segOf(g, 'A')!, 2, 0)[1] - g.fy).toBeCloseTo(unf(plain, segOf(plain, 'A')!, 2, 0)[1] - plain.fy - BAND_MM, 6);
    expect(unf(g, segOf(g, 'B')!, 2, 0)[1] - g.fy).toBeCloseTo(unf(plain, segOf(plain, 'B')!, 2, 0)[1] - plain.fy, 6);
  });

  test('касание развёртки А — то же место на стене', () => {
    const p = unf(g, segOf(g, 'A')!, 3.2, 1.1);
    expect(locate(g, p[0], p[1])).toEqual({ place: 'wall', wallId: 'A', off: 3200, z: 1100 });
  });

  test('потолок у стены А — тоже за полоской', () => {
    const gc = geom(withBehind(room, 'A', 'коридор'), sheet(), A3, [], { show: true, wallId: 'A' });
    expect(ceilPt(gc, 2, 0)![1]).toBeCloseTo(unf(gc, segOf(gc, 'A')!, 2, 3)[1], 6);
  });

  test('в схеме полоска тоже около 6 мм', () => {
    const gs = geom(withBehind(room, 'A', 'коридор'), sheet({ mode: 'schematic' }), A3);
    const b = segOf(gs, 'A')!.band * gs.s;
    expect(b).toBeGreaterThan(5);
    expect(b).toBeLessThanOrEqual(BAND_MM + 1e-9);
  });

  test('у перегородки к соседнему помещению полоски нет', () => {
    let p = setWallBehind(blank(), 'A', 'коридор');
    const r = addAnnex(p, 'k', [{ x: 2000, y: -3000 }, { x: 6000, y: -3000 }, { x: 6000, y: 0 }, { x: 2000, y: 0 }], 'подсобка');
    expect(r.ok).toBe(true);
    p = (r as { plan: typeof p }).plan;
    const ga = geom(p.room, p.sheet, A3, p.annexes);
    expect(ga.segs.find(sg => sg.wall.id === 'A')!.band).toBe(0);
  });
});

describe('на листе', () => {
  test('вписано — полоска с подписью; пусто — нет', () => {
    const svg = drawSheet(setWallBehind(blank(), 'B', 'Коридор'));
    expect(svg).toContain('>Коридор</text>');
    expect(svg).toContain('<polygon points=');
    expect(drawSheet(blank())).not.toContain('<polygon points=');
  });

  test('развёртка скрыта — полоска у стены остаётся', () => {
    const svg = drawSheet(setWallElev(setWallBehind(blank(), 'V', 'Двор дома'), 'V', { hidden: true }));
    expect(svg).toContain('>Двор дома</text>');
  });
});
