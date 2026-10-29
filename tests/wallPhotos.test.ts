// Этап 9: снимки на развёртке стен — участок кадра, рамка на снимке, масштаб по фото, формат.
import { describe, expect, test } from 'vitest';
import { addWallPhoto, removePhoto, setRoomSize } from '../src/model/actions';
import { blank } from '../src/model/state';
import { cond } from '../src/model/units';
import type { Plan, WallPhoto } from '../src/model/types';
import { applyScaleFix, frameAspect, frameAt, frameSpan, photoBoxOf, photoScale } from '../src/model/wallPhotos';
import { loadPlan } from '../src/model/migrate';
import { drawSheet, sheetGeom, sheetSvg } from '../src/render/sheet';

// пустой план 10 × 6 × 3 м, один снимок
const base = (): Plan => ({
  ...blank(),
  photos: [{ id: 'ph', n: '1', file: 'a.jpg', name: 'a.jpg', type: 'image/jpeg', size: 1, sha256: '', kind: 'overview', link: { kind: 'wall', wallId: 'A' }, takenAt: '', hasGps: false, addedAt: '', source: 'file', shot: '', caption: '', arrows: [] }],
});
const frame = (o: Partial<WallPhoto> = {}): WallPhoto => ({
  id: 'f', photoId: 'ph', wallId: 'A', show: true, opacity: 0.8,
  // кадр без перспективы: стена занимает середину снимка
  quad: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 }],
  left: { kind: 'corner' }, right: { kind: 'corner' }, ...o,
});

describe('участок стены под кадром', () => {
  test('от угла до угла — вся стена', () => {
    const p = addWallPhoto(base(), frame());
    expect(frameSpan(p, p.wallPhotos[0]!)).toEqual({ from: 0, to: 10_000 });
    expect(frameAspect(p, p.wallPhotos[0]!)).toBeCloseTo(10 / 3, 9);
  });

  test('длинная стена из двух кадров: второй — от ориентира 4,2 м до угла', () => {
    const p = addWallPhoto(addWallPhoto(base(), frame({ id: 'f1', right: { kind: 'mark', off: cond(4200) } })), frame({ id: 'f2', left: { kind: 'mark', off: cond(4200) } }));
    expect(frameSpan(p, p.wallPhotos[1]!)).toEqual({ from: 4200, to: 10_000 });
    expect(frameAt(p, 'A', 2000)?.id).toBe('f1');
    expect(frameAt(p, 'A', 7000)?.id).toBe('f2');
    expect(frameAt(p, 'B', 2000)).toBeUndefined();
  });

  test('ориентир правее правого края — кадр не годится', () => {
    const p = base();
    expect(frameSpan(p, frame({ left: { kind: 'mark', off: cond(6000) }, right: { kind: 'mark', off: cond(5000) } }))).toBeNull();
  });

  test('при новой длине стены условный ориентир сдвигается пропорционально', () => {
    const p = setRoomSize(addWallPhoto(base(), frame({ right: { kind: 'mark', off: cond(4000) } })), { L: 12_000 });
    expect(p.wallPhotos[0]!.right).toEqual({ kind: 'mark', off: cond(4800) });
  });
});

describe('рамка объекта на снимке', () => {
  test('окно 2 м шириной, 1,5 м высотой, от 1 м и на высоте 0,9 м', () => {
    const p = addWallPhoto(base(), frame());
    const b = photoBoxOf(p, p.wallPhotos[0]!, { off: 1000, z: 900, w: 2000, h: 1500 })!;
    // по горизонтали: 0,1 + 0,8 × (1/10 … 3/10); по вертикали: 0,2 + 0,6 × ((3 − 2,4)/3 … (3 − 0,9)/3)
    expect(b.x).toBeCloseTo(0.18, 9);
    expect(b.w).toBeCloseTo(0.16, 9);
    expect(b.y).toBeCloseTo(0.32, 9);
    expect(b.h).toBeCloseTo(0.3, 9);
  });
});

describe('масштаб по фото', () => {
  test('по горизонтали, кадр от угла до угла: длина стены', () => {
    const p = addWallPhoto(base(), frame());
    // отрезок в 1/10 кадра = 1 м по плану, а на самом деле 0,9 м → стена 9 м
    const r = photoScale(p, p.wallPhotos[0]!, { x: 0.2, y: 0.5 }, { x: 0.3, y: 0.52 }, 900)!;
    expect(r).toMatchObject({ dir: 'h', fix: { what: 'wall', mm: 9000 }, locked: false });
    const q = applyScaleFix(p, 'f', r.fix);
    expect(q.room.walls.find(w => w.id === 'A')!.length).toEqual(cond(9000));
  });

  test('по вертикали: высота помещения', () => {
    const p = addWallPhoto(base(), frame());
    const r = photoScale(p, p.wallPhotos[0]!, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, 3200)!;
    expect(r.fix).toEqual({ what: 'height', mm: 3200 });
    expect(applyScaleFix(p, 'f', r.fix).room.height).toEqual(cond(3200));
  });

  test('кадр до ориентира: поправляется ориентир, а не стена', () => {
    const p = addWallPhoto(base(), frame({ right: { kind: 'mark', off: cond(4000) } }));
    const r = photoScale(p, p.wallPhotos[0]!, { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, 2500)!;
    expect(r.fix).toEqual({ what: 'right', mm: 5000 });
    expect(applyScaleFix(p, 'f', r.fix).wallPhotos[0]!.right).toEqual({ kind: 'mark', off: cond(5000) });
  });

  test('замеренную высоту не правим — только показываем', () => {
    const p = addWallPhoto(base(), frame());
    p.room.height = { mm: 3000, status: 'measured', method: 'tape' };
    expect(photoScale(p, p.wallPhotos[0]!, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, 3200)!.locked).toBe(true);
  });
});

describe('снимок убран — его выпрямления тоже', () => {
  test('removePhoto', () => {
    const p = removePhoto(addWallPhoto(base(), frame()), 'ph');
    expect(p.photos).toEqual([]);
    expect(p.wallPhotos).toEqual([]);
  });
});

test('план со снимками на стенах сохраняется и открывается как есть', () => {
  const p = addWallPhoto(base(), frame({ right: { kind: 'mark', off: cond(4200) } }));
  expect(loadPlan(JSON.parse(JSON.stringify(p)))).toEqual({ ok: true, plan: p });
});

describe('снимок на листе', () => {
  const p = addWallPhoto(addWallPhoto(base(), frame()), frame({ id: 'fb', wallId: 'B' }));
  const imgs = { f: 'blob:a', fb: 'blob:b' };

  test('только на экране: в файлах (PDF, SVG, PNG) картинок нет', () => {
    expect(sheetSvg(p)).not.toContain('<image');
    expect(drawSheet(p, { screen: true, wallImages: imgs })).toContain('href="blob:a"');
  });

  test('стена А — потолок вверху, стена Б — развёрнута на 180°', () => {
    const g = sheetGeom(p);
    const svg = drawSheet(p, { screen: true, wallImages: imgs });
    const m = (url: string) => /matrix\(([^)]*)\)/.exec(svg.slice(svg.indexOf(`href="${url}"`)))![1]!.split(' ').map(Number);
    const [a, b, c, d, e, f] = m('blob:a');
    expect([a, b, c]).toEqual([+(10 * g.s).toFixed(3), 0, 0]);
    expect(d).toBeCloseTo(3 * g.s, 2);
    expect(e).toBeCloseTo(g.fx, 2);
    // потолок — на высоте стены от наружной грани (толщина стены, этап 12)
    expect(f).toBeCloseTo(g.fy - 3 * g.s - g.t, 2);
    const [a2, , , d2] = m('blob:b');
    expect(a2).toBeLessThan(0);
    expect(d2).toBeLessThan(0);
  });

  test('скрытый кадр не рисуется', () => {
    const q = { ...p, wallPhotos: p.wallPhotos.map(w => ({ ...w, show: false })) };
    expect(drawSheet(q, { screen: true, wallImages: imgs })).not.toContain('<image');
  });
});
