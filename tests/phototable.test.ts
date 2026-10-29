// Фототаблица: подписи снимков, порядок, раскладка по листам A4, строка подписи.
import { describe, expect, test } from 'vitest';
import example from '../examples/auditorium.plan.json';
import type { Photo, Plan } from '../src/model/types';
import { PAGE, arrowGeom, arrowsTail, captionDraft, isSmall, layoutPhototable, newArrow, photoCaption, phototableOrder, signer, type TableBox } from '../src/photos/phototable';

const aud = (): Plan => structuredClone(example) as unknown as Plan;

const photo = (o: Partial<Photo>): Photo => ({
  id: 'ph', n: '1', file: 'a.jpg', name: 'a.jpg', type: 'image/jpeg', size: 1, sha256: '', kind: '', link: { kind: 'none' },
  takenAt: '', hasGps: false, addedAt: '', source: 'file', shot: '', caption: '', arrows: [], ...o,
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

describe('стрелки на снимке', () => {
  const ar = (markerId: string, id = markerId) => newArrow(id, markerId, 0.5, 0.5);

  test('одна стрелка: «Стрелкой № 1 указано: …» после подписи', () => {
    const p = aud();
    const ph = photo({ n: '4', caption: 'Стол преподавателя', arrows: [ar('id047')] });
    expect(photoCaption(p, ph)).toBe('Фото № 4. Стол преподавателя. Стрелкой № 1 указано: предметы на столе преподавателя: клавиатура, мышь, карандаши.');
  });

  test('несколько: по номерам меток, повтор метки — один раз', () => {
    const p = aud();
    const ph = photo({ arrows: [ar('id048', 'a'), ar('id047', 'b'), ar('id047', 'c')] });
    expect(arrowsTail(p, ph)).toMatch(/^Стрелками указаны: № 1 — предметы на столе .*; № 2 — окно с открытой внутрь створкой .*\.$/);
  });

  test('в своей подписи уже сказано про стрелки — хвост не добавляется', () => {
    const p = aud();
    const ph = photo({ n: '5', caption: 'Общий вид, стрелкой № 1 указан стол', arrows: [ar('id047')] });
    expect(photoCaption(p, ph)).toBe('Фото № 5. Общий вид, стрелкой № 1 указан стол.');
  });

  test('метку удалили — её стрелка в подписи не упоминается', () => {
    expect(arrowsTail(aud(), photo({ arrows: [ar('нет такой')] }))).toBe('');
  });

  test('новая стрелка: хвост внутри снимка; наконечник у острия', () => {
    for (const [x, y] of [[0.05, 0.05], [0.95, 0.95], [0.5, 0.1]] as const) {
      const a = newArrow('a', 'm', x, y);
      expect(a.tx).toBeGreaterThan(0); expect(a.tx).toBeLessThan(1);
      expect(a.ty).toBeGreaterThan(0); expect(a.ty).toBeLessThan(1);
    }
    const g = arrowGeom({ id: 'a', markerId: 'm', x: 0.5, y: 0.5, tx: 0.3, ty: 0.5 }, 100, 100);
    expect(g.head[0]).toEqual({ x: 50, y: 50 });
    expect(g.base.x).toBeLessThan(50);
    expect(g.from.x).toBeCloseTo(30 + g.r);
  });
});

test('длинная подпись: снимок чуть меньше, но остаётся на листе', () => {
  const split = (t: string) => t.match(/.{1,60}/g) ?? [''];
  const long = 'Фото № 2. ' + 'очень длинная подпись со стрелками '.repeat(5);
  const pages = layoutPhototable([
    { id: 'a', w: 4000, h: 3000, small: false, caption: 'Фото № 1.' },
    { id: 'b', w: 4000, h: 3000, small: false, caption: long },
  ], 60, split);
  expect(pages.map(p => p.map(s => s.id))).toEqual([['a', 'b']]);
  const b = pages[0]![1]!;
  expect(b.capY + (b.lines.length - 1) * 4.8).toBeLessThanOrEqual(PAGE.bottom);
  expect(b.x + b.w / 2).toBeCloseTo((PAGE.left + PAGE.right) / 2);
});

test('стрелка на ту же метку, что и снимок: описание не повторяется', () => {
  const p = aud();
  const ph = photo({ n: '4', kind: 'nodal', link: { kind: 'marker', markerId: 'id048' }, arrows: [newArrow('a', 'id048', 0.3, 0.4)] });
  expect(photoCaption(p, ph)).toMatch(/^Фото № 4\. Метка № 2, вид с окружающей обстановкой\. Стрелкой № 2 указано: окно с открытой внутрь створкой/);
});
