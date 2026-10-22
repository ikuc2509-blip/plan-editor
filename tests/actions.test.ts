// Действия над планом: пропорциональный сдвиг, неизменность старого состояния, ряды парт.
import { describe, expect, test } from 'vitest';
import { addRows, moveTo, patchDims, setRoomSize } from '../src/model/actions';
import { rectSize } from '../src/model/room';
import { blank, example } from '../src/model/state';
import type { Dim, Plan } from '../src/model/types';

const measured = (d: Dim): Dim => ({ ...d, status: 'measured', method: 'tape' });

/** Пример, где часть размеров «замерена» */
function withMeasured(): Plan {
  const p = example();
  p.wallItems[0]!.off = measured(p.wallItems[0]!.off);
  p.items[0]!.x = measured(p.items[0]!.x);
  p.markers[3]!.y = measured(p.markers[3]!.y);
  return p;
}

describe('setRoomSize — пропорциональный сдвиг', () => {
  const p = withMeasured();
  // было 12 × 7 × 3,2 м → стало 15 × 7 × 3,2: всё вдоль L растягивается в 1,25 раза
  const q = setRoomSize(p, { L: 15_000 });

  test('стены перестроены', () => {
    expect(rectSize(q.room).L.mm).toBe(15000);
    expect(q.room.walls.find(w => w.id === 'B')!.a).toEqual({ x: 15000, y: 7000 });
    expect(q.room.walls.find(w => w.id === 'A')!.name).toBe('оконная');
  });

  test('условное положение вдоль L сдвигается пропорционально', () => {
    const i = 1; // предметы: первый замерен, второй — условный
    // второе окно стены А, отступ 3,2 м
    expect(p.wallItems[2]!.off.mm).toBe(3200);
    expect(q.wallItems[2]!.off.mm).toBe(4000);
    expect(q.items[i]!.x.mm).toBe(Math.round(p.items[i]!.x.mm * 1.25));
    expect(q.markers[3]!.x.mm).toBe(Math.round(p.markers[3]!.x.mm * 1.25));
  });

  test('замеренное остаётся на месте', () => {
    expect(q.wallItems[0]!.off).toEqual(p.wallItems[0]!.off);
    expect(q.items[0]!.x).toEqual(p.items[0]!.x);
  });

  test('размеры объектов не меняются — только положение', () => {
    q.wallItems.forEach((it, i) => { expect(it.w).toEqual(p.wallItems[i]!.w); expect(it.h).toEqual(p.wallItems[i]!.h); });
    q.items.forEach((it, i) => { expect(it.w).toEqual(p.items[i]!.w); expect(it.d).toEqual(p.items[i]!.d); });
  });

  test('по ширине и стенам В, Г ничего не сдвигается, если W не менялась', () => {
    expect(q.items.map(i => i.y)).toEqual(p.items.map(i => i.y));
    const onG = (pl: Plan) => pl.wallItems.filter(i => i.wallId === 'G').map(i => i.off.mm);
    expect(onG(q)).toEqual(onG(p));
  });

  test('высота: условная высота от пола сдвигается, замеренная — нет', () => {
    const r = setRoomSize(p, { h: 4_000 });
    expect(r.wallItems[1]!.z.mm).toBe(Math.round(150 * 1.25));
    expect(r.markers[1]!.z.mm).toBe(Math.round(1800 * 1.25));
    // предметы на полу от высоты не зависят
    expect(r.items.map(i => [i.x, i.y])).toEqual(p.items.map(i => [i.x, i.y]));
  });

  test('статус самой длины помещения сохраняется', () => {
    const m = { ...p, room: { ...p.room, walls: p.room.walls.map(w => (w.id === 'A' ? { ...w, length: measured(w.length) } : w)) } };
    expect(rectSize(setRoomSize(m, { L: 12_340 }).room).L).toEqual({ mm: 12340, status: 'measured', method: 'tape' });
  });

  test('старый план не меняется (нужно для отмены)', () => {
    const before = JSON.stringify(p);
    setRoomSize(p, { L: 20_000, W: 9_000, h: 3_500 });
    expect(JSON.stringify(p)).toBe(before);
  });

  test('туда и обратно — те же значения с точностью до 1 мм', () => {
    const back = setRoomSize(setRoomSize(p, { L: 15_000 }), { L: 12_000 });
    back.items.forEach((it, i) => expect(Math.abs(it.x.mm - p.items[i]!.x.mm)).toBeLessThanOrEqual(1));
  });
});

describe('правка значений', () => {
  test('ввод в поле сохраняет статус «замерено»', () => {
    const p = withMeasured();
    const id = p.items[0]!.id;
    const q = patchDims(p, 'items', id, { x: 1234 });
    expect(q.items[0]!.x).toEqual({ mm: 1234, status: 'measured', method: 'tape' });
  });

  test('перетаскивание делает положение условным', () => {
    const p = withMeasured();
    const id = p.items[0]!.id;
    expect(moveTo(p, 'items', id, { x: 1300 }).items[0]!.x).toEqual({ mm: 1300, status: 'conditional' });
  });
});

describe('ряды парт', () => {
  test('как в примере аудитории: 10 рядов по две парты', () => {
    let n = 0;
    const p = addRows(blank(), { rows: 10, x0: 2600, step: 850, depth: 500, margin: 500, aisle: 800 }, () => 'd' + ++n);
    expect(p.items).toHaveLength(20);
    // ширина зала 6 м: (6 − 2·0,5 − 0,8) / 2 = 2,1 м на колонку
    expect(p.items[0]!.d.mm).toBe(2100);
    expect(p.items[1]!.y.mm).toBe(500 + 2100 + 800);
    expect(p.items[19]!.x.mm).toBe(2600 + 9 * 850);
  });
});
