import { describe, expect, test } from 'vitest';
import { formatMeters, parseLength } from '../src/model/units';

describe('parseLength — ввод длины', () => {
  test.each<[string, number]>([
    ['1,25', 1250],
    ['1.25', 1250],
    ['1,25 м', 1250],
    ['1,25м', 1250],
    ['1,25 m', 1250],
    ['125 см', 1250],
    ['125см', 1250],
    ['125 cm', 1250],
    ['1250 мм', 1250],
    ['1250мм', 1250],
    ['1 250 мм', 1250],
    ['  3  ', 3000],
    [',5', 500],
    ['0,005', 5],
    ['12,5 мм', 13],
    ['125 СМ', 1250],
    ['125 см.', 1250],
    ['-0,4', -400],
    ['0', 0],
    ['1,2345', 1235],
  ])('«%s» → %i мм', (text, mm) => {
    expect(parseLength(text)).toEqual({ ok: true, mm });
  });

  test.each(['', '   ', 'abc', '1,2,3', '1.2.3', '1,25 км', '-', ',', '1e3', '12 метров'])('«%s» — ошибка с подсказкой, без падения', text => {
    const r = parseLength(text);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.length).toBeGreaterThan(0);
  });

  test('опечатка с огромным числом', () => {
    expect(parseLength('125000000 см')).toEqual({ ok: false, error: 'Слишком большое значение' });
  });
});

describe('formatMeters — вывод в поле', () => {
  test.each<[number, string]>([
    [1250, '1,25'],
    [3000, '3'],
    [3200, '3,2'],
    [5, '0,005'],
    [0, '0'],
    [-400, '-0,4'],
    [12345, '12,345'],
  ])('%i мм → «%s»', (mm, text) => {
    expect(formatMeters(mm)).toBe(text);
  });

  test('вывод и ввод сходятся', () => {
    for (const mm of [0, 1, 50, 999, 1000, 1250, 5150, 12000, 123456]) {
      expect(parseLength(formatMeters(mm))).toEqual({ ok: true, mm });
    }
  });
});
