// Этап 5 «Чистовик»: поворот предметов, предметы квартиры, выноски, сетка, отмена и повтор.
import { describe, expect, test } from 'vitest';
import { angleFromHandle, gridLineStep, itemCenter, itemCorners, rotatePt, snapAngle, snapMm } from '../src/geometry/rotate';
import { addCallout, addItem, patch, setAngle, setSheet } from '../src/model/actions';
import { IT_SIZE, IT_TYPES } from '../src/model/labels';
import { blank } from '../src/model/state';
import { cond } from '../src/model/units';
import type { Item, ItemType, Plan } from '../src/model/types';
import { drawSheet, sheetSvg } from '../src/render/sheet';
import { LEGEND_BOX, SYMBOL_TYPES, itemSymbol } from '../src/render/symbols';
import { dispatch, plan, redo, undo } from '../src/ui/store';

const item = (x: number, y: number, w: number, d: number, angle: number): Item => ({
  id: 't', type: 'table', label: '', x: cond(x), y: cond(y), w: cond(w), d: cond(d), angle, origin: { kind: 'manual' },
});
const near = (a: { x: number; y: number }[], b: { x: number; y: number }[]) =>
  a.forEach((p, i) => { expect(p.x).toBeCloseTo(b[i]!.x, 6); expect(p.y).toBeCloseTo(b[i]!.y, 6); });

describe('поворот: координаты углов', () => {
  test('без поворота — углы прямоугольника', () => {
    near(itemCorners(item(1000, 2000, 800, 400, 0)), [{ x: 1000, y: 2000 }, { x: 1800, y: 2000 }, { x: 1800, y: 2400 }, { x: 1000, y: 2400 }]);
  });

  test('90° по часовой: стол 0,8 × 0,4 встаёт «вдоль» Y вокруг центра', () => {
    const it = item(1000, 2000, 800, 400, 90);
    expect(itemCenter(it)).toEqual({ x: 1400, y: 2200 });
    // левый верхний угол уходит вправо вверх: по часовой стрелке при оси Y вниз
    near(itemCorners(it), [{ x: 1600, y: 1800 }, { x: 1600, y: 2600 }, { x: 1200, y: 2600 }, { x: 1200, y: 1800 }]);
  });

  test('45°: углы на окружности вокруг центра, диагональ сохраняется', () => {
    const it = item(0, 0, 1000, 1000, 45);
    const c = itemCorners(it);
    near([c[0]!], [{ x: 500, y: 500 - 500 * Math.SQRT2 }]);
    expect(Math.hypot(c[2]!.x - c[0]!.x, c[2]!.y - c[0]!.y)).toBeCloseTo(1000 * Math.SQRT2, 6);
  });

  test('поворот на 360° — то же положение', () => {
    near([rotatePt({ x: 3, y: 4 }, { x: 1, y: 1 }, 360)], [{ x: 3, y: 4 }]);
  });
});

describe('ручка поворота', () => {
  const c = { x: 10, y: 10 };
  test('над центром — 0°, справа — 90°, снизу — 180°, слева — 270°', () => {
    expect(angleFromHandle(c, { x: 10, y: 0 })).toBeCloseTo(0);
    expect(angleFromHandle(c, { x: 20, y: 10 })).toBeCloseTo(90);
    expect(angleFromHandle(c, { x: 10, y: 20 })).toBeCloseTo(180);
    expect(angleFromHandle(c, { x: 0, y: 10 })).toBeCloseTo(270);
  });

  test('у прямых углов прилипает, иначе — до градуса; Alt (магнит 0) — без прилипания', () => {
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(357.5)).toBe(0);
    expect(snapAngle(37.4)).toBe(37);
    expect(snapAngle(88, 0)).toBe(88);
  });

  test('поле «градусы»: приводится к 0…360, десятые доли', () => {
    let p = addItem(blank(), 'a', 'bed');
    p = setAngle(p, 'a', -30);
    expect(p.items[0]!.angle).toBe(330);
    expect(setAngle(p, 'a', 370.04).items[0]!.angle).toBe(10);
    expect(setAngle(p, 'a', 720).items[0]!.angle).toBe(0);
    expect(setAngle(p, 'a', NaN)).toBe(p);
  });
});

describe('предметы квартиры', () => {
  test('новый предмет — типовых размеров, в середине помещения 10 × 6 м', () => {
    const p = addItem(blank(), 'b', 'bed');
    const b = p.items[0]!;
    expect([b.w.mm, b.d.mm]).toEqual([1600, 2000]);
    expect([b.x.mm, b.y.mm]).toEqual([(10_000 - 1600) / 2, (6_000 - 2000) / 2]);
    expect(b.x.status).toBe('conditional');
  });

  test('этап 11: новая мебель и контур тела — свои знаки и место в легенде', () => {
    const fresh: ItemType[] = ['armchair', 'nightstand', 'dresser', 'shelf', 'wardrobe', 'writingDesk', 'tv', 'computer', 'carpet', 'mirror', 'washer', 'shower', 'safe', 'body'];
    for (const t of fresh) {
      expect(SYMBOL_TYPES).toContain(t);
      expect(LEGEND_BOX[t]).toHaveLength(2);
    }
    // контур тела — голова у стороны Y = 0, штриховая линия
    expect(itemSymbol('body', 0, 0, 6, 18)).toContain('stroke-dasharray');
  });

  test('у каждого вида есть название и размер', () => {
    for (const t of Object.keys(IT_TYPES) as ItemType[]) expect(IT_SIZE[t]).toHaveLength(2);
  });

  test('каждый знак квартиры рисуется и попадает в легенду со своим названием', () => {
    let p: Plan = blank();
    SYMBOL_TYPES.forEach((t, i) => { p = addItem(p, 'i' + i, t); });
    const svg = drawSheet(p);
    for (const t of SYMBOL_TYPES) expect(svg).toContain(`>${IT_TYPES[t]}</text>`);
    // предметов нет на плане — нет и в легенде
    expect(drawSheet(blank())).not.toContain('>Кровать</text>');
  });

  test('повёрнутый предмет рисуется с поворотом вокруг центра; без поворота — без transform', () => {
    let p = addItem(blank(), 'a', 'sofa');
    expect(drawSheet(p)).not.toMatch(/data-kind="it"[^>]*transform/);
    p = setAngle(p, 'a', 30);
    expect(drawSheet(p)).toMatch(/data-kind="it" data-id="a" style="cursor:move" transform="rotate\(30 /);
  });

  test('ручка поворота — только у выделенного предмета на экране, не в файле', () => {
    const p = addItem(blank(), 'a', 'sofa');
    expect(drawSheet(p, { sel: { kind: 'it', id: 'a' } })).toContain('data-handle="rot"');
    expect(sheetSvg(p)).not.toContain('data-handle');
  });
});

describe('выноски', () => {
  const p = patch(addCallout(blank(), 'c'), 'callouts', 'c', { text: 'следы волочения' });

  test('новая выноска указывает в середину помещения', () => {
    expect(p.callouts[0]!.target).toEqual({ x: 5000, y: 3000 });
  });

  test('на листе: текст, полка, стрелка-наконечник', () => {
    const svg = drawSheet(p);
    expect(svg).toContain('>следы волочения</text>');
    expect(svg).toMatch(/data-kind="co" data-id="c"[^]*<path d="M[^"]+Z" fill="#111"\/>/);
  });

  test('кончик стрелки можно тянуть только на экране', () => {
    expect(drawSheet(p, { sel: { kind: 'co', id: 'c' } })).toContain('data-handle="tip"');
    expect(sheetSvg(p)).not.toContain('data-handle');
  });

  test('длинный текст переносится, перевод строки сохраняется', () => {
    const q = patch(p, 'callouts', 'c', { text: 'первая строка\nвторая' });
    const svg = drawSheet(q);
    expect(svg).toContain('>первая строка</text>');
    expect(svg).toContain('>вторая</text>');
  });
});

describe('сетка', () => {
  test('привязка: шаг 5 см, 1 см; 0 — до миллиметра', () => {
    expect(snapMm(1234, 50)).toBe(1250);
    expect(snapMm(1234, 10)).toBe(1230);
    expect(snapMm(1234.4, 0)).toBe(1234);
  });

  test('видимые линии не гуще 2,5 мм листа', () => {
    // 1:50 — 20 мм листа на метр: шаг 5 см = 1 мм — слишком часто, рисуем через 50 см
    expect(gridLineStep(50, 20)).toBe(500);
    expect(gridLineStep(100, 20)).toBe(500);
    // крупный лист: 1 см = 3 мм — рисуем каждый сантиметр
    expect(gridLineStep(10, 300)).toBe(10);
    expect(gridLineStep(0, 20)).toBeNull();
  });

  test('сетка рисуется только на экране', () => {
    const p = setSheet(blank(), { mode: 'scale', scale: 50 });
    expect(drawSheet(p, { grid: 50 })).toContain('stroke-opacity="0.22"');
    expect(sheetSvg(p)).not.toContain('stroke-opacity="0.22"');
  });
});

describe('отмена и повтор поворота', () => {
  test('поворот ручкой — один шаг истории', () => {
    plan.value = addItem(blank(), 'r', 'bed');
    for (const a of [10, 20, 30]) dispatch(p => setAngle(p, 'r', a), 'drag:rot');
    expect(plan.value.items[0]!.angle).toBe(30);
    undo();
    expect(plan.value.items[0]!.angle).toBe(0);
    redo();
    expect(plan.value.items[0]!.angle).toBe(30);
  });
});

describe('эталон: квартира', () => {
  test('кухня-гостиная со всеми знаками, повёрнутым стулом и выноской', async () => {
    let p = setSheet(blank(), { mode: 'scale', scale: 50 });
    const put = (id: string, t: ItemType, x: number, y: number, angle = 0) => {
      p = addItem(p, id, t);
      p = patch(p, 'items', id, { x: cond(x), y: cond(y), angle });
    };
    put('bed', 'bed', 300, 200);
    put('sofa', 'sofa', 3000, 200);
    put('fridge', 'fridge', 9300, 200);
    put('stove', 'stove', 8600, 200);
    put('sink', 'sink', 7900, 200);
    put('bath', 'bath', 300, 5000);
    put('toilet', 'toilet', 2300, 5100, 180);
    put('column', 'column', 5000, 2800);
    put('chair', 'chair', 6500, 3500, 37);
    p = patch(addCallout(p, 'c'), 'callouts', 'c', { text: 'стул опрокинут', at: { x: 7500, y: 4500 }, target: { x: 6700, y: 3700 } });
    await expect(sheetSvg(p)).toMatchFileSnapshot('../examples/reference/v3-apartment.svg');
  });
});
