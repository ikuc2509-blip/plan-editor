// Лист из новой модели должен совпадать с листом прототипа: тот же текст и те же
// элементы, а числа — с точностью до 0,01 мм листа (из-за округления длин до 1 мм
// и пересчёта отступов на стенах Б и В последние знаки могут отличаться).
// Эталоны сделаны скриптом scripts/make-reference.mjs из prototype/plan-editor.html.
import { describe, expect, test } from 'vitest';
import { drawSheet, sheetSvg } from '../src/render/sheet';
import { blank, example } from '../src/model/state';
import { setNorth, setNotes, setSheet } from '../src/model/actions';
import refSchematic from '../examples/reference/sheet-schematic.svg?raw';
import refScale100 from '../examples/reference/sheet-scale100.svg?raw';
import refBlank from '../examples/reference/sheet-blank.svg?raw';

const TOL = 0.01;
const NUM = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g;

/**
 * На стенах Б и В направление стены поменялось (отступ от другого угла),
 * поэтому линии проёма рисуются от другого конца. На листе это те же линии:
 * приводим концы линии к одному порядку и сортируем линии внутри элемента.
 */
function normalize(svg: string): string {
  const key = (s: string) => s.replace(NUM, n => (+n).toFixed(1));
  const line = svg.replace(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g, (all, x1, y1, x2, y2) => {
    const a = [+x1, +y1], b = [+x2, +y2];
    const swap = a[0]! - b[0]! > TOL || (Math.abs(a[0]! - b[0]!) <= TOL && a[1]! - b[1]! > TOL);
    return swap ? `<line x1="${x2}" y1="${y2}" x2="${x1}" y2="${y1}"` : all;
  });
  return line.replace(/(<g data-kind="wi"[^>]*>)((?:<line [^>]*\/>)+)/g,
    (_, open: string, lines: string) => open + (lines.match(/<line [^>]*\/>/g) ?? []).sort((p, q) => key(p).localeCompare(key(q))).join(''));
}

/** Сравнить два SVG: текст между числами — точно, числа — с допуском */
function diffSvg(gotRaw: string, wantRaw: string): string | null {
  const got = normalize(gotRaw), want = normalize(wantRaw);
  const textG = got.split(NUM), textW = want.split(NUM);
  const numG = got.match(NUM) ?? [], numW = want.match(NUM) ?? [];
  if (textG.length !== textW.length) return `разное число фрагментов: ${textG.length} и ${textW.length}`;
  let ctx = '';
  for (let i = 0; i < textW.length; i++) {
    if (textG[i] !== textW[i]) return `текст №${i}: «${textG[i]}» вместо «${textW[i]}» после «${ctx.slice(-120)}»`;
    if (i < numW.length && Math.abs(+numG[i]! - +numW[i]!) > TOL) {
      return `число ${numG[i]} вместо ${numW[i]} после «${(ctx + textW[i]).slice(-160)}»`;
    }
    ctx += textW[i]! + (numW[i] ?? '');
  }
  return null;
}

describe('лист совпадает с прототипом', () => {
  test('пример аудитории, схематично', () => {
    expect(diffSvg(sheetSvg(example()), refSchematic)).toBeNull();
  });

  test('пример аудитории, масштаб 1:100, север и примечания', () => {
    let p = setSheet(example(), { mode: 'scale', scale: 100 });
    p = setNorth(p, '30');
    p = setNotes(p, 'Дополнительное примечание.\nВторое примечание.');
    expect(diffSvg(sheetSvg(p), refScale100)).toBeNull();
  });

  test('пустой план', () => {
    expect(diffSvg(sheetSvg(blank()), refBlank)).toBeNull();
  });

  test('проверка сравнения ловит сдвиг на 0,1 мм', () => {
    expect(diffSvg('<rect x="10.1"/>', '<rect x="10"/>')).not.toBeNull();
    expect(diffSvg('<rect x="10.004"/>', '<rect x="10"/>')).toBeNull();
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
