// Этап 7: отпечаток SHA-256 не меняется после «сохранить → открыть», EXIF, имена файлов,
// список съёмки, привязки снимков.
import { describe, expect, test } from 'vitest';
import { checkPhotos, describePhoto, exifDate, formatSize, readExif, sha256Hex, showTaken, uniqueFileName } from '../src/photos/meta';
import { linkText, shotList, shotPhotos } from '../src/photos/shots';
import { addPhotos, nextPhotoNumber, patch, remove } from '../src/model/actions';
import { loadPlan } from '../src/model/migrate';
import { example } from '../src/model/state';
import type { Photo, Plan } from '../src/model/types';
import { readOmp, writeOmp } from '../src/storage/omp';

/** Минимальный JPEG с EXIF: время съёмки и (по желанию) широта GPS */
function jpegWithExif(date: string, gps: boolean): Uint8Array {
  const tiff = new Uint8Array(130);
  const v = new DataView(tiff.buffer);
  const u16 = (o: number, x: number) => v.setUint16(o, x, true), u32 = (o: number, x: number) => v.setUint32(o, x, true);
  tiff.set([0x49, 0x49, 0x2a, 0x00]); u32(4, 8);
  const entry = (o: number, tag: number, type: number, count: number, value: number) => { u16(o, tag); u16(o + 2, type); u32(o + 4, count); u32(o + 8, value); };
  // IFD0: ссылки на EXIF и GPS
  u16(8, gps ? 2 : 1); entry(10, 0x8769, 4, 1, 38); if (gps) entry(22, 0x8825, 4, 1, 56);
  // EXIF: DateTimeOriginal
  u16(38, 1); entry(40, 0x9003, 2, 20, 86);
  // GPS: широта N 55° 45′
  u16(56, 2); entry(58, 0x0001, 2, 2, 0x4e); entry(70, 0x0002, 5, 3, 106);
  tiff.set(new TextEncoder().encode(date + '\0'), 86);
  [55, 1, 45, 1, 0, 1].forEach((x, i) => u32(106 + i * 4, x));
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  const len = exif.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...exif, 0xff, 0xd9]);
}

const NONE = { kind: '' as const, link: { kind: 'none' as const }, shot: '' };

async function photo(p: Plan, bytes: Uint8Array, name: string, extra: Partial<Photo> = {}): Promise<Photo> {
  const ph = await describePhoto({ bytes, name, type: 'image/jpeg', source: 'file' }, 'id' + name, nextPhotoNumber(p), new Set(p.photos.map(x => x.file)), NONE);
  return { ...ph, ...extra };
}

describe('отпечаток SHA-256', () => {
  test('известное значение', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('меняется от одного байта', async () => {
    const a = jpegWithExif('2026:10:22 10:15:00', false), b = a.slice();
    b[b.length - 3]! ^= 1;
    expect(await sha256Hex(a)).not.toBe(await sha256Hex(b));
  });
});

describe('EXIF', () => {
  test('время съёмки и координаты', async () => {
    expect(await readExif(jpegWithExif('2026:10:22 10:15:00', true))).toEqual({ takenAt: '2026-10-22T10:15:00', hasGps: true });
  });

  test('без координат', async () => {
    expect(await readExif(jpegWithExif('2026:10:21 09:00:05', false))).toEqual({ takenAt: '2026-10-21T09:00:05', hasGps: false });
  });

  test('не снимок — пустые сведения, без ошибки', async () => {
    expect(await readExif(new TextEncoder().encode('не картинка'))).toEqual({ takenAt: '', hasGps: false });
  });

  test('запись даты', () => {
    expect(exifDate('2026:10:22 10:15:00')).toBe('2026-10-22T10:15:00');
    expect(exifDate('мусор')).toBe('');
    expect(showTaken('2026-10-22T10:15:00')).toBe('22.10.2026 10:15');
  });
});

describe('имя в photos/', () => {
  test('латиница и цифры, повтор — с номером', () => {
    expect(uniqueFileName('IMG_20261022_101500.JPG', new Set())).toBe('IMG_20261022_101500.jpg');
    expect(uniqueFileName('Фото окна (1).jpeg', new Set())).toBe('1.jpeg');
    expect(uniqueFileName('Фото.jpg', new Set())).toBe('photo.jpg');
    expect(uniqueFileName('a.jpg', new Set(['a.jpg', 'a_2.jpg']))).toBe('a_3.jpg');
  });
});

describe('сохранить → открыть', () => {
  const build = async () => {
    let p = example();
    const b1 = jpegWithExif('2026:10:22 10:15:00', true), b2 = jpegWithExif('2026:10:22 10:16:00', false);
    const ph1 = await photo(p, b1, 'IMG_1.jpg', { kind: 'detail', link: { kind: 'marker', markerId: p.markers[1]!.id } });
    p = addPhotos(p, [ph1]);
    const ph2 = await photo(p, b2, 'IMG_2.jpg', { kind: 'overview', link: { kind: 'wall', wallId: 'G' } });
    p = addPhotos(p, [ph2]);
    return { p, files: { [ph1.file]: b1, [ph2.file]: b2 } };
  };
  const meta = { created: '2026-10-22T08:00:00.000Z', modified: '2026-10-22T09:00:00.000Z', saveNumber: 1 };

  test.each([undefined, 'секрет-123'])('пароль: %s — байты, отпечатки и привязки те же', async pw => {
    const { p, files } = await build();
    const r = await readOmp(await writeOmp({ plan: p, meta, photos: files }, pw), pw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content.plan.photos).toEqual(p.photos);
    for (const ph of r.content.plan.photos) {
      expect(r.content.photos[ph.file]).toEqual(files[ph.file]);
      expect(await sha256Hex(r.content.photos[ph.file]!)).toBe(ph.sha256);
    }
    expect(await checkPhotos(r.content.plan.photos, r.content.photos)).toEqual({ missing: [], changed: [] });
  });

  test('изменённый и пропавший снимок замечаются при открытии', async () => {
    const { p, files } = await build();
    const [a, b] = p.photos;
    const bad = files[a!.file]!.slice();
    bad[10]! ^= 1;
    expect(await checkPhotos(p.photos, { [a!.file]: bad })).toEqual({ missing: [b!.n], changed: [a!.n] });
  });
});

describe('сведения о снимке', () => {
  test('номер следующий, размер, тип, время из EXIF', async () => {
    let p = example();
    const ph = await photo(p, jpegWithExif('2026:10:22 10:15:00', true), 'IMG_1.jpg');
    expect(ph).toMatchObject({ n: '1', file: 'IMG_1.jpg', type: 'image/jpeg', takenAt: '2026-10-22T10:15:00', hasGps: true, source: 'file' });
    expect(ph.size).toBe(jpegWithExif('2026:10:22 10:15:00', true).length);
    p = addPhotos(p, [{ ...ph, n: '7' }]);
    expect(nextPhotoNumber(p)).toBe('8');
  });

  test('снимок камеры без EXIF — время момента съёмки', async () => {
    const ph = await describePhoto({ bytes: new Uint8Array([1, 2, 3]), name: 'camera_1.jpg', type: 'image/jpeg', source: 'camera', takenAt: '2026-10-22T11:00:00' }, 'c', '1', new Set(), NONE);
    expect(ph.takenAt).toBe('2026-10-22T11:00:00');
  });

  test('план с привязками переживает запись в JSON и открытие', async () => {
    let p = example();
    p = addPhotos(p, [await photo(p, new Uint8Array([9]), 'x.jpg', { link: { kind: 'marker', markerId: p.markers[0]!.id } })]);
    const r = loadPlan(JSON.parse(JSON.stringify(p)));
    expect(r.ok && r.plan.photos).toEqual(p.photos);
  });

  test('вес проекта', () => {
    expect(formatSize(850 * 1024)).toBe('850 КБ');
    expect(formatSize(84 * 1024 * 1024)).toBe('84 МБ');
  });
});

describe('список съёмки', () => {
  const p = example();
  const items = shotList(p);

  test('ориентирующая, 4 обзорные, 4 стены, у каждой метки узловая и детальная', () => {
    expect(items).toHaveLength(1 + 4 + 4 + 2 * p.markers.length);
    expect(items[0]!.kind).toBe('orienting');
    expect(items.filter(i => i.key.startsWith('wall:')).map(i => i.link)).toEqual(['A', 'B', 'V', 'G'].map(wallId => ({ kind: 'wall', wallId })));
    expect(items.find(i => i.key === `marker:${p.markers[0]!.id}:detail`)).toMatchObject({ kind: 'detail', link: { kind: 'marker', markerId: p.markers[0]!.id } });
  });

  test('пункт «снято», когда есть снимок из него; удаление снимка снимает отметку', async () => {
    const it = items.find(i => i.key === 'wall:A')!;
    let q = addPhotos(p, [await photo(p, new Uint8Array([1]), 'w.jpg', { kind: it.kind, link: it.link, shot: it.key })]);
    expect(shotPhotos(q, 'wall:A')).toHaveLength(1);
    q = remove(q, 'photos', q.photos[0]!.id);
    expect(shotPhotos(q, 'wall:A')).toHaveLength(0);
  });

  test('подпись привязки; удалённая метка', async () => {
    const m = p.markers[1]!;
    expect(linkText(p, { kind: 'marker', markerId: m.id })).toBe(`метка № ${m.n}`);
    expect(linkText(p, { kind: 'wall', wallId: 'B' })).toBe('стена Б');
    expect(linkText(remove(p, 'markers', m.id), { kind: 'marker', markerId: m.id })).toBe('метка удалена');
    expect(linkText(patch(p, 'markers', m.id, { n: '9' }), { kind: 'marker', markerId: m.id })).toBe('метка № 9');
  });
});
