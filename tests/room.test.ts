// Этап 12: чистый лист и своя комната — стены по углам, длины, углы, привязки меток, лист.
import { describe, expect, test } from 'vitest';
import { addMarker, clearRoom, drawRoom, moveCorner, patch, rectTemplate, setWallLength } from '../src/model/actions';
import { emptyPlan } from '../src/model/state';
import { isRect, noRoom, polygonWalls, roomExtent, signedArea2 } from '../src/model/room';
import { applyMeasure, measureList, tieOf } from '../src/model/measure';
import { drawSheet } from '../src/render/sheet';
import { cond } from '../src/model/units';
import type { Plan, Point } from '../src/model/types';

/** Г-образная комната 6 × 5 м с вырезом 2 × 2 м справа снизу; углы — против часовой, начиная не с верхнего */
const L_SHAPE: Point[] = [
  { x: 1000, y: 6000 }, { x: 5000, y: 6000 }, { x: 5000, y: 4000 }, { x: 7000, y: 4000 }, { x: 7000, y: 1000 }, { x: 1000, y: 1000 },
];
const lRoom = (): Plan => drawRoom(emptyPlan(), L_SHAPE);

describe('стены по углам', () => {
  const walls = polygonWalls(L_SHAPE);

  test('обход по часовой, начало координат — левый верхний угол, первая стена — верхняя', () => {
    expect(walls).toHaveLength(6);
    expect(signedArea2(walls.map(w => w.a))).toBeGreaterThan(0);
    expect(walls[0]!.a).toEqual({ x: 0, y: 0 });
    expect(walls[0]!.b).toEqual({ x: 6000, y: 0 });
    expect(walls.map(w => w.letter).join('')).toBe('АБВГДЕ');
    // стены сомкнуты
    walls.forEach((w, i) => expect(walls[(i + 1) % 6]!.a).toEqual(w.b));
  });

  test('длины — условные, по расстоянию между углами', () => {
    expect(walls.map(w => w.length.mm)).toEqual([6000, 3000, 2000, 2000, 4000, 5000]);
    expect(walls.every(w => w.length.status === 'conditional')).toBe(true);
  });

  test('лишние углы на прямой и повторы убираются; меньше трёх углов — не комната', () => {
    const pts = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
    expect(polygonWalls(pts)).toHaveLength(4);
    expect(polygonWalls([{ x: 0, y: 0 }, { x: 1000, y: 0 }])).toEqual([]);
  });
});

describe('чистый лист, заготовка, нарисованная комната', () => {
  test('новый план — без комнаты; заготовка — прямоугольник 10 × 6', () => {
    const p = emptyPlan();
    expect(noRoom(p.room)).toBe(true);
    const r = rectTemplate(p);
    expect(isRect(r.room)).toBe(true);
    expect(roomExtent(r.room)).toEqual({ minX: 0, minY: 0, maxX: 10_000, maxY: 6000 });
  });

  test('нарисованная комната — не прямоугольник; «нарисовать заново» убирает стены и всё, что на них', () => {
    let p = lRoom();
    expect(isRect(p.room)).toBe(false);
    p = addMarker(p, 'm', 'w2');
    p = patch(p, 'markers', 'm', { place: 'wall' });
    p = clearRoom(p);
    expect(noRoom(p.room)).toBe(true);
    expect(p.markers).toEqual([]);
  });
});

describe('длина стены и углы', () => {
  test('длиннее стена А — комната растягивается вправо, параллельные стены тоже', () => {
    const p = setWallLength(lRoom(), 'w1', 7000);
    const len = Object.fromEntries(p.room.walls.map(w => [w.letter, w.length.mm]));
    expect(len).toEqual({ А: 7000, Б: 3000, В: 2000, Г: 2000, Д: 5000, Е: 5000 });
    expect(roomExtent(p.room).maxX).toBe(7000);
    p.room.walls.forEach((w, i) => expect(p.room.walls[(i + 1) % p.room.walls.length]!.a).toEqual(w.b));
  });

  test('замер стены: значение и статус одним действием', () => {
    const p = applyMeasure(lRoom(), { t: 'wall', id: 'w6' }, 5200, 'measured', 'tape');
    const w = p.room.walls.find(k => k.id === 'w6')!;
    expect(w.length).toEqual({ mm: 5200, status: 'measured', method: 'tape' });
    const e = roomExtent(p.room);
    expect(e.maxY - e.minY).toBe(5200);
  });

  test('угол передвинут — у двух стен новая длина, условная', () => {
    const p = moveCorner(lRoom(), 3, { x: 4000, y: 3500 });
    const len = Object.fromEntries(p.room.walls.map(w => [w.letter, w.length.mm]));
    expect(len['В']).toBe(Math.round(Math.hypot(2000, 500)));
    expect(len['Г']).toBe(1500);
  });
});

describe('метка в нарисованной комнате', () => {
  test('привязки — к ближайшим стенам напротив метки', () => {
    let p = addMarker(lRoom(), 'm', 'w1');
    p = patch(p, 'markers', 'm', { x: cond(1000), y: cond(4500) });
    // по X: стена Е (x = 0) ближе, чем Г (x = 4000)
    expect(tieOf(p, p.markers[0]!, 'x')).toMatchObject({ letter: 'Е', mm: 1000, dir: 1 });
    // по Y: снизу стена Д (y = 5000) в 500 мм; стена А сверху дальше
    expect(tieOf(p, p.markers[0]!, 'y')).toMatchObject({ letter: 'Д', mm: 500, dir: -1 });
    // замер привязки ставит метку на нужное расстояние от стены
    const q = applyMeasure(p, { t: 'tie', id: 'm', axis: 'y' }, 800, 'measured');
    expect(q.markers[0]!.y.mm).toBe(4200);
  });

  test('чек-лист замеров: стены по буквам и высота', () => {
    const rows = measureList(lRoom()).filter(r => r.group === 'Помещение');
    expect(rows.map(r => r.what)).toEqual(['стена А', 'стена Б', 'стена В', 'стена Г', 'стена Д', 'стена Е', 'высота h']);
  });
});

describe('лист', () => {
  test('чистый лист рисуется: рамка, штамп, без стен', () => {
    const svg = drawSheet(emptyPlan());
    expect(svg).toContain('Развёрнутый план помещения');
    expect(svg).not.toContain('СТЕНА');
  });

  test('нарисованная комната: шесть развёрток, длины у стен пустыми строками', () => {
    const svg = drawSheet(lRoom(), { screen: true });
    for (const k of 'АБВГДЕ') expect(svg).toContain(`СТЕНА ${k} (развёртка)`);
    expect(svg).toContain('А: ____ м');
    expect(svg).toContain('data-measure="wall:w1"');
    expect(svg).not.toContain('L (длина помещения)');
  });
});
