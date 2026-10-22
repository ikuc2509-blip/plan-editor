// Лист, нарисованный новым кодом, должен совпадать с листом прототипа символ в символ.
// Эталоны сделаны скриптом scripts/make-reference.mjs из prototype/plan-editor.html.
import { describe, expect, test } from 'vitest';
import { sheetSvg } from '../src/render/sheet';
import { blank, example } from '../src/model/state';
import refSchematic from '../examples/reference/sheet-schematic.svg?raw';
import refScale100 from '../examples/reference/sheet-scale100.svg?raw';
import refBlank from '../examples/reference/sheet-blank.svg?raw';

describe('лист совпадает с прототипом', () => {
  test('пример аудитории, схематично', () => {
    expect(sheetSvg(example())).toBe(refSchematic);
  });

  test('пример аудитории, масштаб 1:100, север и примечания', () => {
    const s = example();
    s.room.mode = 'scale';
    s.room.scale = 100;
    s.north = '30';
    s.notes = 'Дополнительное примечание.\nВторое примечание.';
    expect(sheetSvg(s)).toBe(refScale100);
  });

  test('пустой план', () => {
    expect(sheetSvg(blank())).toBe(refBlank);
  });
});

describe('выделение', () => {
  test('рамка выделения есть на экране и не попадает в файл', async () => {
    const { drawSheet } = await import('../src/render/sheet');
    const s = example();
    const id = s.markers[0]!.id;
    expect(drawSheet(s, { sel: { kind: 'mk', id } })).toContain('stroke="#2F6FB3"');
    expect(sheetSvg(s)).not.toContain('stroke="#2F6FB3"');
  });
});
