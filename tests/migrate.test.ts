// Открытие старых файлов: прототип → формат версии 1.
import { describe, expect, test } from 'vitest';
import { fromPrototype, loadPlan, v1to2, type PlanV1 } from '../src/model/migrate';
import type { ProtoPlan } from '../src/model/prototype';
import type { Plan } from '../src/model/types';
import proto from '../examples/auditorium.prototype.json';
import v1file from '../examples/old/auditorium.v1.json';

const old = proto as unknown as ProtoPlan;
const v1 = v1file as unknown as PlanV1;

/** Пример в текущем формате получается переводом файла прототипа и лежит в examples/ */
test('пример аудитории в текущем формате — это переведённый файл прототипа', async () => {
  const r = loadPlan(structuredClone(old));
  expect(r.ok).toBe(true);
  await expect(JSON.stringify((r as { plan: Plan }).plan, null, 1) + '\n').toMatchFileSnapshot('../examples/auditorium.plan.json');
});

describe('перевод из прототипа', () => {
  const p = fromPrototype(structuredClone(old));
  const wi = (label: string) => p.wallItems.find(i => i.label === label)!;

  test('номер формата', () => {
    expect(p.format).toBe('plan-editor');
    expect(p.version).toBe(1);
  });

  test('помещение — 4 стены 12 × 7 м по часовой стрелке, высота 3,2 м', () => {
    expect(p.room.walls.map(w => w.letter)).toEqual(['А', 'Г', 'Б', 'В']);
    expect(p.room.walls.map(w => w.length.mm)).toEqual([12000, 7000, 12000, 7000]);
    expect(p.room.height.mm).toBe(3200);
    expect(p.room.walls.find(w => w.id === 'A')!.name).toBe('оконная');
  });

  test('метры → целые миллиметры, без хвостов вроде 5,1499999', () => {
    const desks = p.items.filter(i => i.type === 'desk');
    expect(desks).toHaveLength(20);
    expect(desks.map(d => d.x.mm).slice(0, 8)).toEqual([2600, 2600, 3450, 3450, 4300, 4300, 5150, 5150]);
    for (const d of desks) expect(Number.isInteger(d.d.mm)).toBe(true);
  });

  test('всё «условно»: прототип не знал замеров', () => {
    const dims = [
      ...p.room.walls.map(w => w.length), p.room.height,
      ...p.wallItems.flatMap(i => [i.off, i.z, i.w, i.h]),
      ...p.items.flatMap(i => [i.x, i.y, i.w, i.d]),
      ...p.markers.flatMap(m => [m.x, m.y, m.off, m.z]),
    ];
    expect(dims.every(d => d.status === 'conditional')).toBe(true);
  });

  test('стена А: отступ не меняется', () => {
    const first = p.wallItems[0]!;
    expect([first.wallId, first.off.mm]).toEqual(['A', 1000]);
  });

  test('стена Б: отступ — от другого угла, петли меняются местами', () => {
    // Д1: в прототипе 1,2 м от левого края листа, ширина 1 м; стена 12 м
    expect(wi('Д1').off.mm).toBe(12000 - 1200 - 1000);
    expect(wi('Д1').hinge).toBe('end');
    expect(wi('Д2').off.mm).toBe(12000 - 9800 - 1000);
    expect(wi('Д2').hinge).toBe('start');
  });

  test('стена Г: направление то же, отступ не меняется', () => {
    const m2 = p.markers.find(m => m.n === '2')!;
    expect([m2.wallId, m2.off.mm, m2.z.mm]).toEqual(['G', 1500, 1800]);
  });

  test('происхождение — вручную', () => {
    expect(p.items.every(i => i.origin.kind === 'manual')).toBe(true);
  });

  test('старый файл без подложки открывается', () => {
    const { underlay: _, ...noUnderlay } = structuredClone(old);
    const r = loadPlan(noUnderlay);
    expect(r.ok && r.plan.underlay.src).toBe('');
  });
});

describe('файл версии 1 (этап 1)', () => {
  const r = loadPlan(structuredClone(v1));

  test('открывается и переводится в текущую версию', () => {
    expect(r.ok && r.migratedFrom).toBe('v1');
    expect(r.ok && r.plan.version).toBe(2);
  });

  test('лист — A3, как было; галочки showDims больше нет', () => {
    const sheet = r.ok ? r.plan.sheet : null;
    expect(sheet).toEqual({ paper: 'A3', mode: 'schematic', scale: 100, showTies: true });
  });

  test('остальное без изменений', () => {
    const { version: _a, sheet: _b, ...rest1 } = v1;
    const { version: _c, sheet: _d, ...rest2 } = (r as { plan: Plan }).plan;
    expect(rest2).toEqual(rest1);
  });

  test('прототип переводится через версию 1', () => {
    expect(loadPlan(structuredClone(old))).toEqual({ ok: true, plan: v1to2(fromPrototype(structuredClone(old))), migratedFrom: 'prototype' });
  });
});

describe('loadPlan', () => {
  const p = v1to2(fromPrototype(structuredClone(old)));

  test('файл текущей версии открывается как есть', () => {
    const r = loadPlan(JSON.parse(JSON.stringify(p)));
    expect(r).toEqual({ ok: true, plan: p });
  });

  test('файл более новой версии — понятная ошибка', () => {
    const r = loadPlan({ ...p, version: 99 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/более новой версией/);
  });

  test.each([null, 42, 'текст', {}, { format: 'plan-editor' }, { format: 'plan-editor', version: 1 }])('не план: %j', raw => {
    expect(loadPlan(raw).ok).toBe(false);
  });
});
