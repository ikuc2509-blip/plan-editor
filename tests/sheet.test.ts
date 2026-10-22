// Лист этапа 2: раскладка A3/A4, подписи размеров по статусу, серое незамеренное, линейный масштаб.
// Эталоны листа — examples/reference/v2-*.svg (лист прототипа — sheet-*.svg — остаётся для истории).
import { describe, expect, test } from 'vitest';
import { drawSheet, sheetSvg } from '../src/render/sheet';
import { layoutFor } from '../src/render/layout';
import { wrap } from '../src/render/svg';
import { blank, example } from '../src/model/state';
import { patch, setNorth, setNotes, setRoomDimStatus, setSheet } from '../src/model/actions';
import type { Dim, Plan } from '../src/model/types';

const m = (d: Dim): Dim => ({ ...d, status: 'measured', method: 'tape' });
const scale = (p: Plan, k = 100) => setSheet(p, { mode: 'scale', scale: k });

/** Все надписи листа: [x, y, текст] */
function texts(svg: string): [number, number, string][] {
  return [...svg.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>([^<]*)<\/text>/g)].map(t => [+t[1]!, +t[2]!, t[3]!]);
}

describe('эталоны листа', () => {
  test.each<[string, () => Plan]>([
    ['a3-schematic', () => example()],
    ['a3-scale100', () => setNotes(setNorth(setRoomDimStatus(scale(example()), 'L', true), '30'), 'Дополнительное примечание.')],
    ['a4-scale200', () => setSheet(scale(example(), 200), { paper: 'A4' })],
    ['a4-schematic', () => setSheet(example(), { paper: 'A4' })],
    ['blank', () => blank()],
  ])('%s', async (name, make) => {
    await expect(sheetSvg(make())).toMatchFileSnapshot(`../examples/reference/v2-${name}.svg`);
  });
});

describe('формат листа', () => {
  test.each(['A3', 'A4'] as const)('%s: размер файла и рамка', paper => {
    const lay = layoutFor(paper);
    const svg = sheetSvg(setSheet(example(), { paper }));
    expect(svg).toContain(`width="${lay.w}mm" height="${lay.h}mm" viewBox="0 0 ${lay.w} ${lay.h}"`);
    // все надписи внутри листа
    for (const [x, y] of texts(svg)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(lay.w);
      expect(y).toBeLessThanOrEqual(lay.h);
    }
  });

  test.each(['A3', 'A4'] as const)('%s: легенда и примечания не заходят на штамп', paper => {
    const lay = layoutFor(paper);
    const p = setSheet(scale(example(), 200), { paper });
    const svg = drawSheet(p);
    // штамп — прямоугольник от границы колонки до правого края рамки
    const right = lay.frame.x + lay.frame.w;
    const stamp = [...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)"/g)]
      .find(r => +r[1]! === lay.colX && Math.abs(+r[3]! - (right - lay.colX)) < 0.01);
    expect(stamp).toBeDefined();
    const stampTop = +stamp![2]!;
    const column = texts(svg).filter(([x, y]) => x >= lay.colX && y < stampTop - 0.01);
    const lowest = Math.max(...column.map(([, y]) => y));
    expect(lowest).toBeLessThan(stampTop - 2);
  });

  test('A4: условные знаки — под чертежом, не в колонке', () => {
    const lay = layoutFor('A4');
    const svg = drawSheet(setSheet(example(), { paper: 'A4' }));
    const door = texts(svg).find(t => t[2] === 'Дверь (направление')!;
    expect(door[0]).toBeLessThan(lay.colX);
    expect(door[1]).toBeGreaterThan(lay.area.y + lay.area.h);
  });
});

describe('подписи размеров по статусу (оба режима)', () => {
  test.each(['schematic', 'scale'] as const)('%s: условное — пустая строка, замеренное — число', mode => {
    let p = setSheet(example(), { mode });
    expect(drawSheet(p)).toContain('L (длина помещения) = ________ м');
    p = setRoomDimStatus(p, 'L', true);
    const svg = drawSheet(p);
    expect(svg).toContain('L (длина помещения) = 12,00 м');
    expect(svg).toContain('W (ширина) = ________ м');
  });

  test('привязка метки: число только если замерено', () => {
    let p = example();
    const mk = p.markers[0]!; // метка 1 у стен А и В: расстояния — это сами X и Y
    expect(drawSheet(p)).not.toContain('>1,20<');
    p = patch(p, 'markers', mk.id, { x: m(mk.x) });
    expect(drawSheet(p)).toContain('>1,20<');
  });

  test('всё замерено — нет строки «внести по результатам замеров»', () => {
    let p = example();
    const full = drawSheet(p);
    expect(full).toContain('внести по результатам замеров');
    for (const k of ['L', 'W', 'h'] as const) p = setRoomDimStatus(p, k, true);
    p = { ...p, sheet: { ...p.sheet, showTies: false } };
    expect(drawSheet(p)).not.toContain('внести по результатам замеров');
  });
});

describe('незамеренное — серым, только в масштабе', () => {
  test('схематично серого нет', () => {
    expect(drawSheet(example())).not.toContain('#9A9A9A');
  });

  test('в масштабе: серое, знак в легенде и примечание', () => {
    const svg = drawSheet(scale(example()));
    expect(svg).toContain('#9A9A9A');
    expect(svg).toContain('Не замерено, нанесено');
    expect(svg).toContain('Положение объектов, показанных серым,');
    expect(svg).toContain('Положение меток № 1, 2, 3, 4');
  });

  test('замеренный предмет рисуется чёрным', () => {
    const p0 = scale(example());
    const it = p0.items.find(i => i.type === 'teacher')!;
    const p = patch(p0, 'items', it.id, { x: m(it.x), y: m(it.y), w: m(it.w), d: m(it.d) });
    const group = (svg: string) => svg.match(new RegExp(`<g data-kind="it" data-id="${it.id}"[^>]*>(.*?)</g>`))![1]!;
    expect(group(drawSheet(p0))).toContain('#9A9A9A');
    expect(group(drawSheet(p))).not.toContain('#9A9A9A');
  });
});

describe('линейный масштаб', () => {
  const bar = (svg: string) => svg.match(/<g><rect x="[^"]+" y="[^"]+" width="([^"]+)" height="1.4" fill="#111"/);

  test('только в масштабе', () => {
    expect(bar(drawSheet(example()))).toBeNull();
  });

  test.each([[100, 10], [200, 5], [50, 20]])('1:%i — отрезок 1 м равен %i мм листа', (k, mm) => {
    expect(+bar(drawSheet(scale(example(), k)))![1]!).toBe(mm);
  });
});

describe('перенос строк', () => {
  test('«№» не отрывается от номера', () => {
    expect(wrap('Грязевой след на наружном отливе окна № 2 (снаружи здания)', 40)).toEqual([
      'Грязевой след на наружном отливе окна',
      '№ 2 (снаружи здания)',
    ]);
  });
});

describe('выделение', () => {
  test('рамка выделения есть на экране и не попадает в файл', () => {
    const s = example();
    const id = s.markers[0]!.id;
    expect(drawSheet(s, { sel: { kind: 'mk', id } })).toContain('stroke="#2F6FB3"');
    expect(sheetSvg(s)).not.toContain('stroke="#2F6FB3"');
  });
});
