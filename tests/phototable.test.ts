// Фототаблица: подписи снимков, порядок, раскладка по листам A4, строка подписи.
import { describe, expect, test } from 'vitest';
import example from '../examples/auditorium.plan.json';
import type { Photo, Plan } from '../src/model/types';
import { PAGE, captionDraft, isSmall, layoutPhototable, photoCaption, phototableOrder, signer, type TableBox } from '../src/photos/phototable';

const aud = (): Plan => structuredClone(example) as unknown as Plan;

const photo = (o: Partial<Photo>): Photo => ({
  id: 'ph', n: '1', file: 'a.jpg', name: 'a.jpg', type: 'image/jpeg', size: 1, sha256: '', kind: '', link: { kind: 'none' },
  takenAt: '', hasGps: false, addedAt: '', source: 'file', shot: '', caption: '', ...o,
});

describe('подписи', () => {
  test('черновик по метке: номер, описание, вид съёмки', () => {
    const p = aud();
    expect(captionDraft(p, photo({ kind: 'detail', link: { kind: 'marker', markerId: 'id047' } })))
      .toBe('Метка № 1 — Предметы на столе преподавателя: клавиатура, мышь, карандаши, крупный план');
    expect(captionDraft(p, photo({ kind: 'nodal', link: { kind: 'marker', markerId: 'id048' } })))
      .toMatch(/^Метка № 2 — Окно .*, вид с окружающей обстановкой$/);
  });

  test('черновик по стене, ориентирующий и обзорный из угла', () => {
    const p = aud();
    expect(captionDraft(p, photo({ kind: 'overview', link: { kind: 'wall', wallId: 'A' } }))).toBe('Стена А (оконная), общий вид');
    expect(captionDraft(p, photo({ kind: 'orienting' }))).toBe('Ориентирующий снимок: Аудитория, ул. Широкая, 33');
    expect(captionDraft(p, photo({ kind: 'overview', shot: 'overview:AV' }))).toBe('Общий вид помещения из угла А/В');
    expect(captionDraft(p, photo({}))).toBe('');
  });

  test('своя подпись важнее черновика; «Фото № N.» и точка — сами', () => {
    const p = aud();
    expect(photoCaption(p, photo({ n: '7', caption: 'След подошвы обуви' }))).toBe('Фото № 7. След подошвы обуви.');
    expect(photoCaption(p, photo({ n: '8', caption: 'Нож?' }))).toBe('Фото № 8. Нож?');
    expect(photoCaption(p, photo({ n: '2', kind: 'orienting' }))).toBe('Фото № 2. Ориентирующий снимок: Аудитория, ул. Широкая, 33.');
    expect(photoCaption(p, photo({ n: '3' }))).toBe('Фото № 3.');
  });

  test('порядок — по номерам: 2 раньше 10', () => {
    const ps = ['10', '2', '1', '1а'].map((n, i) => photo({ id: 'p' + i, n }));
    expect(phototableOrder(ps).map(p => p.n)).toEqual(['1', '1а', '2', '10']);
  });

  test('строка подписи: роль отдельно от фамилии', () => {
    expect(signer('специалист Петров П. П.')).toEqual({ role: 'Специалист', name: 'Петров П. П.' });
    expect(signer('старший следователь Иванов И. И.')).toEqual({ role: 'Старший следователь', name: 'Иванов И. И.' });
    expect(signer('Иванов И. И.')).toEqual({ role: '', name: 'Иванов И. И.' });
    expect(signer('')).toEqual({ role: '', name: '' });
  });
});

describe('раскладка по листам', () => {
  // подпись — одна строка на каждые 60 знаков
  const split = (t: string) => t.match(/.{1,60}/g) ?? [''];
  const wide = (id: string): TableBox => ({ id, w: 4000, h: 3000, small: false, caption: 'Фото № 1. Общий вид' });
  const small = (id: string): TableBox => ({ id, w: 3000, h: 4000, small: true, caption: 'Фото № 9. Гильза' });

  test('широкие — по два на лист, по центру между полями', () => {
    const pages = layoutPhototable([wide('a'), wide('b'), wide('c'), wide('d'), wide('e')], 60, split);
    expect(pages.map(p => p.map(s => s.id))).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    for (const s of pages.flat()) {
      expect(s.x + s.w / 2).toBeCloseTo((PAGE.left + PAGE.right) / 2);
      expect(s.capY + 5).toBeLessThanOrEqual(PAGE.bottom);
    }
  });

  test('крупные планы и вертикальные — по два рядом, одна высота', () => {
    const [page] = layoutPhototable([small('a'), small('b'), wide('c')], 60, split);
    const [a, b, c] = page!;
    expect(a!.y).toBe(b!.y);
    expect(a!.x + a!.w).toBeLessThan(b!.x);
    expect(c!.y).toBeGreaterThan(a!.capY);
  });

  test('что «маленькое»: вертикальный снимок или детальная съёмка', () => {
    expect(isSmall(3000, 4000, 'overview')).toBe(true);
    expect(isSmall(4000, 3000, 'detail')).toBe(true);
    expect(isSmall(4000, 3000, 'overview')).toBe(false);
  });
});
