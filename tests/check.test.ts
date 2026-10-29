// Перед «Осмотр завершён»: что не доделано; время осмотра на листе; новый проём — на свободное место.
import { describe, expect, test } from 'vitest';
import example from '../examples/auditorium.plan.json';
import type { Photo, Plan } from '../src/model/types';
import { inspectionGaps } from '../src/model/check';
import { addWallItem, setStamp } from '../src/model/actions';
import { blank, emptyPlan } from '../src/model/state';
import { dateTime, drawSheet } from '../src/render/sheet';

const aud = (): Plan => structuredClone(example) as unknown as Plan;
const photo = (o: Partial<Photo>): Photo => ({
  id: 'ph', n: '1', file: 'a.jpg', name: 'a.jpg', type: 'image/jpeg', size: 1, sha256: '', kind: '', link: { kind: 'none' },
  takenAt: '', hasGps: false, addedAt: '', source: 'file', shot: '', caption: '', arrows: [], ...o,
});
const texts = (p: Plan) => inspectionGaps(p).map(g => g.text);

describe('что не доделано', () => {
  test('учебная аудитория: время, «Составил», снимки меток, ориентирующий, замеры', () => {
    const t = texts(aud());
    expect(t).toContain('Для штампа не заполнено: время начала, «Составил»');
    expect(t).toContain('Не указано время окончания осмотра');
    expect(t).toContain('Метка № 1 — нет снимка');
    expect(t).toContain('Нет ориентирующего снимка (здание, вход)');
    expect(t.some(s => s.startsWith('Не замерено:'))).toBe(true);
  });

  test('снимок метки или стрелка на неё — снимок есть; повторённый номер снимка — подсказка', () => {
    let p = aud();
    const [m1, m2] = p.markers;
    p = { ...p, photos: [
      photo({ id: 'a', n: '1', kind: 'orienting' }),
      photo({ id: 'b', n: '2', link: { kind: 'marker', markerId: m1!.id } }),
      photo({ id: 'c', n: '2', arrows: [{ id: 'x', markerId: m2!.id, x: 0.5, y: 0.5, tx: 0.4, ty: 0.4 }] }),
    ] };
    const t = texts(p);
    expect(t).not.toContain('Метка № 1 — нет снимка');
    expect(t).not.toContain('Метка № 2 — нет снимка');
    expect(t).not.toContain('Нет ориентирующего снимка (здание, вход)');
    expect(t).toContain('Номер снимка 2 повторяется (2 раза)');
  });

  test('много меток без описания — две строкой и «ещё N»', () => {
    let p = aud();
    p = { ...p, markers: [1, 2, 3, 4, 5].map(n => ({ ...p.markers[0]!, id: 'm' + n, n: String(n), desc: '' })) };
    const t = inspectionGaps(p).filter(g => g.where === 'markers').map(g => g.text);
    expect(t).toEqual(['Метка № 1 — нет описания', 'Метка № 2 — нет описания', 'Ещё 3 меток без описания']);
  });

  test('чистый лист — «Комната не нарисована»', () => {
    expect(texts(emptyPlan())).toContain('Комната не нарисована');
  });
});

describe('время осмотра', () => {
  test('на листе в строке «Дата»: с временем, без него, одна граница', () => {
    const s = aud().stamp;
    expect(dateTime(s)).toBe('22.10.2026');
    expect(dateTime({ ...s, timeStart: '10:15', timeEnd: '11:40' })).toBe('22.10.2026, 10:15–11:40');
    expect(dateTime({ ...s, timeStart: '10:15' })).toBe('22.10.2026, 10:15–__:__');
    expect(drawSheet(setStamp(aud(), { timeStart: '10:15', timeEnd: '11:40' }))).toContain('22.10.2026, 10:15–11:40');
  });
});

describe('новое окно или дверь — на свободное место стены', () => {
  test('окно, потом дверь: дверь не поверх окна', () => {
    let p = blank();
    p = addWallItem(p, 'w', 'window', 'A');
    p = addWallItem(p, 'd', 'door', 'A');
    const [w, d] = p.wallItems;
    expect(w!.off.mm).toBe(500);
    expect(d!.off.mm).toBeGreaterThanOrEqual(w!.off.mm + w!.w.mm);
  });

  test('радиатор под окном — можно на то же место', () => {
    let p = blank();
    p = addWallItem(p, 'w', 'window', 'A');
    p = addWallItem(p, 'r', 'radiator', 'A');
    expect(p.wallItems[1]!.off.mm).toBe(500);
  });

  test('места нет — как раньше, 0,5 м', () => {
    let p = blank();
    for (let i = 0; i < 12; i++) p = addWallItem(p, 'w' + i, 'window', 'A');
    expect(p.wallItems.at(-1)!.off.mm).toBe(500);
  });
});
