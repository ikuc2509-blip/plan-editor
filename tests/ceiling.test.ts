// Потолок (формат 15–16): у стены — откинут за её развёртку; в углу листа — отдельно, уменьшенный. Метки и светильник на нём.
import { describe, expect, test } from 'vitest';
import { createRectRoom } from '../src/model/room';
import { ceilDelta, ceilPt, ceilRect, ceilToFloor, elevOverlaps, fitsAt, geom, locate, type Geom } from '../src/geometry/unfold';
import { layoutFor } from '../src/render/layout';
import { addItem, addMarker, addMarkerAt, patch, resetElevs, setCeiling, setMarkerPlace, setWallElev } from '../src/model/actions';
import { blank } from '../src/model/state';
import { cond } from '../src/model/units';
import type { Ceiling, Plan, SheetOptions } from '../src/model/types';
import { drawSheet, sheetGeom } from '../src/render/sheet';

const room = createRectRoom(10_000, 6_000, 3_000);
const sheet: SheetOptions = { paper: 'A3', mode: 'scale', scale: 100, showTies: true, bw: false };
const A3 = layoutFor('A3').area;
const at = (c: Partial<Ceiling>): Geom => geom(room, sheet, A3, [], { show: true, place: 'wall', wallId: 'A', ...c });
/** у какой стены потолок; в углу — null */
const wallOf = (g: Geom) => (g.ceil?.kind === 'wall' ? g.ceil.sg.wall.id : null);

describe('где потолок на листе', () => {
  // 1:100 — 10 мм листа на 1 м; стена А сверху, развёртка 3 м + толщина стены 0,25 м
  const g = at({});

  test('у стены А: точка у стены — у верхнего края развёртки А, дальше от стены — дальше от пола', () => {
    expect(wallOf(g)).toBe('A');
    const p = ceilPt(g, 2, 0)!, q = ceilPt(g, 2, 1)!, far = ceilPt(g, 2, 6)!;
    expect(p[0]).toBeCloseTo(g.fx + 20, 6);
    expect(p[1]).toBeCloseTo(g.fy - 32.5, 6);
    expect(q[1]).toBeCloseTo(g.fy - 42.5, 6);
    expect(far[1]).toBeCloseTo(g.fy - 92.5, 6);
  });

  test('обратно: точка листа на потолке → та же точка пола', () => {
    const p = ceilPt(g, 3.4, 2.7)!, f = ceilToFloor(g, p[0], p[1])!;
    expect(f[0]).toBeCloseTo(3.4, 6);
    expect(f[1]).toBeCloseTo(2.7, 6);
  });

  test('касание потолка — новая метка «на потолке» с точкой пола под ней', () => {
    const p = ceilPt(g, 4, 1.5)!;
    expect(locate(g, p[0], p[1])).toEqual({ place: 'ceiling', x: 4000, y: 1500 });
  });

  test('не показан — потолка на листе нет', () => {
    const off = geom(room, sheet, A3, [], { show: false, place: 'wall', wallId: 'A' });
    expect(off.ceil).toBeNull();
    expect(ceilPt(off, 1, 1)).toBeNull();
  });

  test('место не выбрано — где план выходит крупнее: у длинной стены', () => {
    expect(wallOf(at({ wallId: '' }))).toBe('A');
  });

  test('развёртка выбранной стены скрыта — потолок у другой стены', () => {
    const r = { ...room, walls: room.walls.map(w => (w.id === 'A' ? { ...w, elev: { hidden: true } } : w)) };
    expect(wallOf(geom(r, sheet, A3, [], { show: true, place: 'wall', wallId: 'A' }))).toBe('B');
  });

  test('отнесён в сторону на 1 м вправо — вся развёртка потолка на 10 мм правее', () => {
    const moved = at({ dx: 1000 });
    const a = ceilPt(g, 2, 1)!, b = ceilPt(moved, 2, 1)!;
    expect(b[0] - moved.fx).toBeCloseTo(a[0] - g.fx + 10, 6);
  });

  test('налезает на развёртку стены — подсказка', () => {
    expect(elevOverlaps(g)).toEqual([]);
    expect(elevOverlaps(at({ dx: -6000, dy: 4000 }))).toContainEqual(['В', 'потолок']);
  });

  test('потолок занимает место: в 1:50 комната 4 × 3 × 2,5 м с потолком на A3 уже не помещается', () => {
    const small = createRectRoom(4_000, 3_000, 2_500);
    expect(fitsAt(small, A3, 50)).toBe(true);
    expect(fitsAt(small, A3, 50, [], { show: true, place: 'wall', wallId: '' })).toBe(false);
  });
});

describe('действия', () => {
  test('метка на потолок — развёртка потолка появляется', () => {
    const p = setMarkerPlace(addMarker(blank(), 'm', 'A'), 'm', 'ceiling');
    expect(p.markers[0]!.place).toBe('ceiling');
    expect(p.ceiling.show).toBe(true);
  });

  test('касанием плана — метка на потолке', () => {
    const p = addMarkerAt(blank(), 'm', { place: 'ceiling', x: 1200, y: 800 });
    expect(p.markers[0]).toMatchObject({ place: 'ceiling', x: cond(1200), y: cond(800) });
  });

  test('светильник — развёртка потолка появляется', () => {
    expect(addItem(blank(), 'l', 'lamp').ceiling.show).toBe(true);
    expect(addItem(blank(), 't', 'table').ceiling.show).toBe(false);
  });

  test('сдвиг потолка: нулевой не хранится; «вернуть на место» возвращает и потолок', () => {
    const p = setCeiling(blank(), { show: true, dx: 1234.4, dy: 0 });
    expect(p.ceiling).toEqual({ show: true, place: 'tr', wallId: '', dx: 1234 });
    expect(resetElevs(setWallElev(p, 'A', { dx: 500 })).ceiling).toEqual({ show: true, place: 'tr', wallId: '' });
  });
});

describe('на листе', () => {
  const withCeil = (): Plan => setMarkerPlace(patch(addMarker(blank(), 'm', 'A'), 'markers', 'm', { x: cond(2000), y: cond(1000) }), 'm', 'ceiling');

  test('подпись потолка и метка на нём — в точке над полом', () => {
    const p = setCeiling(withCeil(), { place: 'wall', wallId: 'A' }), svg = drawSheet(p);
    expect(svg).toContain('ПОТОЛОК (развёртка у стены А)');
    const [x, y] = ceilPt(sheetGeom(p), 2, 1)!;
    expect(svg).toContain(`<circle cx="${x}" cy="${y}" r="2.8"`);
  });

  test('развёртка потолка скрыта — метка в примечаниях', () => {
    const svg = drawSheet(setCeiling(withCeil(), { show: false }));
    expect(svg).not.toContain('ПОТОЛОК');
    expect(svg).toContain('Метка № 1 находится на потолке.');
  });

  test('светильник — на потолке и в легенде', () => {
    const svg = drawSheet(addItem(blank(), 'l', 'lamp'));
    expect(svg).toContain('ПОТОЛОК');
    expect(svg).toContain('>Светильник (на потолке)</text>');
  });

  test('потолок не показан — лист как раньше', () => {
    expect(drawSheet(blank())).not.toContain('ПОТОЛОК');
  });
});

describe('потолок в углу листа (формат 16)', () => {
  // 1:100: без потолка план 16,5 × 12,5 м; в натуральную величину потолок 10 × 6 м в угол не влезает — вдвое меньше
  const g = at({ place: 'tr' });

  test('новый осмотр — потолок в углу справа сверху', () => {
    expect(blank().ceiling.place).toBe('tr');
  });

  test('уменьшен вдвое: план в 1:100 по-прежнему помещается', () => {
    expect(g.ceil).toMatchObject({ kind: 'corner', corner: 'tr', k: 0.5 });
    expect(g.fits).toBe(true);
  });

  test('вид снизу: стена А — нижний край потолка, у угла между А и Г', () => {
    const a = ceilPt(g, 0, 0)!, far = ceilPt(g, 0, 6)!, end = ceilPt(g, 10, 0)!;
    expect(a[0]).toBeCloseTo(g.fx + 102.5, 6);
    expect(a[1]).toBeCloseTo(g.fy - 2.5, 6);
    expect(far[1]).toBeCloseTo(g.fy - 32.5, 6);
    expect(end[0]).toBeCloseTo(g.fx + 152.5, 6);
  });

  test('касание и перетаскивание — по уменьшенному потолку', () => {
    const p = ceilPt(g, 4, 1.5)!;
    expect(locate(g, p[0], p[1])).toEqual({ place: 'ceiling', x: 4000, y: 1500 });
    const f = ceilToFloor(g, p[0], p[1])!;
    expect(f[0]).toBeCloseTo(4, 6);
    expect(ceilDelta(g, 5, 5)).toEqual([10, -10]);
  });

  test('в остальных углах — на своих местах', () => {
    const r = (c: 'tl' | 'br' | 'bl') => ceilRect(at({ place: c }))!, base = ceilRect(g)!;
    expect(base.x).toBeGreaterThan(g.fx + 100);
    expect(r('tl').x + r('tl').w).toBeLessThan(at({ place: 'tl' }).fx);
    expect(r('br').y).toBeGreaterThan(at({ place: 'br' }).fy + 60);
    expect(r('bl').x + r('bl').w).toBeLessThan(at({ place: 'bl' }).fx);
  });

  test('на листе: «вид снизу» и свой масштаб; в схеме — во сколько раз уменьшен', () => {
    let p = setMarkerPlace(addMarker(blank(), 'm', 'A'), 'm', 'ceiling');
    p = { ...p, sheet: { ...p.sheet, mode: 'scale', scale: 100 } };
    const svg = drawSheet(p);
    expect(svg).toContain('ПОТОЛОК (вид снизу)');
    expect(svg).toContain('М 1:200');
    // в схеме план растянут на весь лист — потолок помещается в угол, только уменьшенный вчетверо
    expect(drawSheet({ ...p, sheet: { ...p.sheet, mode: 'schematic' } })).toContain('уменьшено в 4 раза');
  });
});
