// Этап 6 (облегчённый): ввод замера, чек-лист незамеренного, строка «Замеры произведены…».
import { describe, expect, test } from 'vitest';
import { applyMeasure, measureList, measureNote, readMeasure, tieOf } from '../src/model/measure';
import { addMarker, setInstruments, setSheet } from '../src/model/actions';
import { rectSize } from '../src/model/room';
import { blank, example } from '../src/model/state';
import { drawSheet, sheetSvg } from '../src/render/sheet';
import { dispatch, plan, undo } from '../src/ui/store';

describe('чек-лист «Замеры»', () => {
  const p = example();
  const rows = measureList(p);

  test('помещение: длина, ширина, высота — первыми', () => {
    expect(rows.slice(0, 3).map(r => r.what)).toEqual(['длина L (стены А и Б)', 'ширина W (стены В и Г)', 'высота h']);
  });

  test('окна — 4 размера, двери — 3; радиаторы и прочее в чек-лист не входят', () => {
    const windows = p.wallItems.filter(i => i.type === 'window').length;
    const doors = p.wallItems.filter(i => i.type === 'door').length;
    expect(rows.filter(r => r.group === 'Окна и двери')).toHaveLength(windows * 4 + doors * 3);
  });

  test('метка на полу — две привязки, на стене — отступ и высота, снаружи — отступ', () => {
    const marks = rows.filter(r => r.group === 'Метки');
    const expected = p.markers.reduce((n, m) => n + (m.place === 'floor' ? 2 : m.place === 'wall' ? 2 : 1), 0);
    expect(marks).toHaveLength(expected);
    expect(marks.some(r => /^до стены [АБВГ]$/.test(r.what))).toBe(true);
  });

  test('в примере ничего не замерено', () => {
    expect(rows.every(r => r.dim.status === 'conditional')).toBe(true);
  });
});

describe('ввод замера', () => {
  test('длина помещения: число, «замерено», дальномер; условные объекты сдвигаются', () => {
    const p = example();
    const x0 = p.items[0]!.x.mm;
    const q = applyMeasure(p, { t: 'room', key: 'L' }, 12_500, 'measured', 'rangefinder');
    const { L } = rectSize(q.room);
    expect(L).toEqual({ mm: 12_500, status: 'measured', method: 'rangefinder' });
    expect(q.room.walls.find(w => w.id === 'B')!.length.status).toBe('measured');
    expect(q.items[0]!.x.mm).toBe(Math.round((x0 * 12_500) / 12_000));
  });

  test('размер окна; «условно» убирает способ замера', () => {
    const p = example();
    const id = p.wallItems.find(i => i.type === 'window')!.id;
    const ref = { t: 'obj', col: 'wallItems', id, key: 'w' } as const;
    const q = applyMeasure(p, ref, 1460, 'measured', 'tape');
    expect(q.wallItems.find(i => i.id === id)!.w).toEqual({ mm: 1460, status: 'measured', method: 'tape' });
    expect(applyMeasure(q, ref, 1460, 'conditional').wallItems.find(i => i.id === id)!.w).toEqual({ mm: 1460, status: 'conditional' });
  });

  test('привязка к ближней стене: X = расстояние до стены В', () => {
    let p = addMarker(blank(), 'm', 'A'); // середина 10 × 6 м
    p = applyMeasure(p, { t: 'tie', id: 'm', axis: 'x' }, 2000, 'measured');
    expect(p.markers[0]!.x).toEqual({ mm: 2000, status: 'measured', method: 'tape' });
    expect(tieOf(p, p.markers[0]!, 'x')).toMatchObject({ letter: 'В', far: false, mm: 2000 });
  });

  test('привязка к дальней стене: X = длина − расстояние до стены Г', () => {
    let p = addMarker(blank(), 'm', 'A');
    p = applyMeasure(p, { t: 'tie', id: 'm', axis: 'x' }, 7000, 'measured'); // ближе к Г
    expect(tieOf(p, p.markers[0]!, 'x')).toMatchObject({ letter: 'Г', far: true, mm: 3000 });
    p = applyMeasure(p, { t: 'tie', id: 'm', axis: 'x' }, 1500, 'measured');
    expect(p.markers[0]!.x.mm).toBe(10_000 - 1500);
  });

  test('удалённый объект — окна замера нет', () => {
    expect(readMeasure(blank(), { t: 'obj', col: 'items', id: 'нет', key: 'x' })).toBeNull();
    expect(readMeasure(blank(), { t: 'tie', id: 'нет', axis: 'x' })).toBeNull();
  });

  test('замер — один шаг отмены', () => {
    plan.value = example();
    const before = plan.value;
    dispatch(p => applyMeasure(p, { t: 'room', key: 'h' }, 3150, 'measured'));
    expect(plan.value.room.height).toEqual({ mm: 3150, status: 'measured', method: 'tape' });
    undo();
    expect(plan.value).toBe(before);
  });
});

describe('строка «Замеры произведены»', () => {
  test('ничего не замерено — строки нет', () => {
    expect(measureNote(example())).toBeNull();
  });

  test('прибор без названия — пустая строка для руки', () => {
    const p = applyMeasure(example(), { t: 'room', key: 'L' }, 12_000, 'measured', 'tape');
    expect(measureNote(p)).toBe('Замеры произведены: рулетка ______________.');
  });

  test('только применённые приборы, рулетка первой, с названиями', () => {
    let p = applyMeasure(example(), { t: 'room', key: 'h' }, 3200, 'measured', 'rangefinder');
    p = applyMeasure(p, { t: 'room', key: 'L' }, 12_000, 'measured', 'tape');
    p = setInstruments(p, { tape: 'измерительная 5 м', rangefinder: 'Bosch GLM 50-27' });
    expect(measureNote(p)).toBe('Замеры произведены: рулетка измерительная 5 м; лазерный дальномер Bosch GLM 50-27.');
    p = applyMeasure(p, { t: 'room', key: 'L' }, 12_000, 'conditional');
    expect(measureNote(p)).toBe('Замеры произведены: лазерный дальномер Bosch GLM 50-27.');
  });

  test('строка попадает в примечания листа', () => {
    const p = setInstruments(applyMeasure(example(), { t: 'room', key: 'W' }, 7000, 'measured'), { tape: 'измерительная 5 м' });
    // длинная строка переносится — сравниваем текст листа без разбивки на строки
    const text = sheetSvg(p).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('Замеры произведены: рулетка измерительная 5 м.');
  });
});

describe('щелчок по размеру на листе', () => {
  const p = setSheet(example(), { mode: 'scale', scale: 100 });

  test('на экране размеры L, W, h и привязки меток можно щёлкнуть', () => {
    const svg = drawSheet(p, { screen: true });
    for (const k of ['room:L', 'room:W', 'room:h']) expect(svg).toContain(`data-measure="${k}"`);
    const floor = p.markers.find(m => m.place === 'floor')!;
    expect(svg).toContain(`data-measure="tie:${floor.id}:x"`);
  });

  test('в файлах лишних атрибутов нет', () => {
    expect(sheetSvg(p)).not.toContain('data-measure');
  });
});
