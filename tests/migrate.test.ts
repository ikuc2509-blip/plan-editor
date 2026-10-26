// Открытие старых файлов: прототип → формат версии 1.
import { describe, expect, test } from 'vitest';
import { fromPrototype, loadPlan, v1to2, v2to3, v3to4, v4to5, v5to6, v6to7, v7to8, v8to9, v9to10, v10to11, v11to12, type PlanV1, type PlanV2, type PlanV3, type PlanV4, type PlanV5, type PlanV6, type PlanV7, type PlanV8, type PlanV9, type PlanV10, type PlanV11 } from '../src/model/migrate';
import type { ProtoPlan } from '../src/model/prototype';
import { FORMAT_VERSION, type Plan } from '../src/model/types';
import proto from '../examples/auditorium.prototype.json';
import v1file from '../examples/old/auditorium.v1.json';
import v2file from '../examples/old/auditorium.v2.json';
import v3file from '../examples/old/auditorium.v3.json';
import v4file from '../examples/old/auditorium.v4.json';
import v5file from '../examples/old/auditorium.v5.json';
import v6file from '../examples/old/auditorium.v6.json';
import v7file from '../examples/old/auditorium.v7.json';
import v8file from '../examples/old/auditorium.v8.json';
import v9file from '../examples/old/auditorium.v9.json';
import v10file from '../examples/old/auditorium.v10.json';
import v11file from '../examples/old/auditorium.v11.json';

const old = proto as unknown as ProtoPlan;
const v1 = v1file as unknown as PlanV1;
const v2 = v2file as unknown as PlanV2;
const v3 = v3file as unknown as PlanV3;
const v4 = v4file as unknown as PlanV4;
const v5 = v5file as unknown as PlanV5;
const v6 = v6file as unknown as PlanV6;
const v7 = v7file as unknown as PlanV7;
const v8 = v8file as unknown as PlanV8;
const v9 = v9file as unknown as PlanV9;
const v10 = v10file as unknown as PlanV10;
const v11 = v11file as unknown as PlanV11;

/** Сравнение «остальное без изменений»: выбор цветной / чёрно-белый (формат 11) — новое поле листа */
const noBw = <T extends object>(o: T): T => ('sheet' in o && o.sheet && typeof o.sheet === 'object' ? { ...o, sheet: { ...(o.sheet as object), bw: undefined } } : o);

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
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
  });

  test('лист — A3, как было; галочки showDims больше нет', () => {
    const sheet = r.ok ? r.plan.sheet : null;
    expect(sheet).toEqual({ paper: 'A3', mode: 'schematic', scale: 100, showTies: true, bw: false });
  });

  test('остальное без изменений', () => {
    const { version: _a, sheet: _b, ...rest1 } = v1;
    const { version: _c, sheet: _d, instruments: _e, wallPhotos: _f, annexes: _g, ...rest2 } = (r as { plan: Plan }).plan;
    expect(noBw(rest2)).toEqual(noBw(rest1));
  });

  test('прототип переводится через версию 1', () => {
    expect(loadPlan(structuredClone(old))).toEqual({ ok: true, plan: v11to12(v10to11(v9to10(v8to9(v7to8(v6to7(v5to6(v4to5(v3to4(v2to3(v1to2(fromPrototype(structuredClone(old))))))))))))), migratedFrom: 'prototype' });
  });
});

describe('файл версии 2 (этапы 2–4)', () => {
  const r = loadPlan(structuredClone(v2));

  test('открывается и переводится в текущую версию', () => {
    expect(r.ok && r.migratedFrom).toBe('v2');
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
  });

  test('всё остальное без изменений: предметы, углы, штамп, лист', () => {
    const { version: _a, ...rest2 } = v2;
    const { version: _b, annexes: _ax, instruments: _c, wallPhotos: _d, ...rest4 } = (r as { plan: Plan }).plan;
    expect(noBw(rest4)).toEqual(noBw(rest2));
  });
});

describe('файл версии 4 (этап 6)', () => {
  const r = loadPlan(structuredClone(v4));

  test('открывается и переводится в текущую версию', () => {
    expect(r.ok && r.migratedFrom).toBe('v4');
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
  });

  test('снимков нет, остальное без изменений', () => {
    const { version: _a, ...rest4 } = v4;
    const { version: _b, annexes: _ax, wallPhotos: _c, ...rest5 } = (r as { plan: Plan }).plan;
    expect(noBw(rest5)).toEqual(noBw(rest4));
  });

  test('заготовка снимка из версии 4 получает пустые сведения', () => {
    const p = v4to5({ ...structuredClone(v4), photos: [{ id: 'p', n: '1' }] });
    expect(p.photos[0]).toMatchObject({ id: 'p', n: '1', file: '', kind: '', link: { kind: 'none' }, sha256: '' });
  });
});

describe('файл версии 5 (этапы 7–8)', () => {
  const r = loadPlan(structuredClone(v5));

  test('открывается и переводится в текущую версию', () => {
    expect(r.ok && r.migratedFrom).toBe('v5');
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
  });

  test('снимков на стенах нет, остальное без изменений', () => {
    const { version: _a, ...rest5 } = v5;
    const { version: _b, annexes: _ax, wallPhotos, ...rest6 } = (r as { plan: Plan }).plan;
    expect(wallPhotos).toEqual([]);
    expect(noBw(rest6)).toEqual(noBw(rest5));
  });
});

describe('файл версии 6 (этап 9)', () => {
  const r = loadPlan(structuredClone(v6));

  test('открывается и переводится в текущую версию', () => {
    expect(r.ok && r.migratedFrom).toBe('v6');
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
  });

  test('данные без изменений, пометок «предложено моделью» нет', () => {
    const { version: _a, ...rest6 } = v6;
    const { version: _b, annexes: _ax, ...rest7 } = (r as { plan: Plan }).plan;
    expect(noBw(rest7)).toEqual(noBw(rest6));
    expect(JSON.stringify(rest7)).not.toContain('"auto"');
  });
});

describe('файл версии 7 (этап 10)', () => {
  const r = loadPlan(structuredClone(v7));

  test('открывается и переводится в текущую версию, данные без изменений', () => {
    expect(r.ok && r.migratedFrom).toBe('v7');
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
    const { version: _a, ...rest7 } = v7;
    const { version: _b, annexes: _ax, ...rest8 } = (r as { plan: Plan }).plan;
    expect(noBw(rest8)).toEqual(noBw(rest7));
  });
});

describe('файл версии 8 (этап 11)', () => {
  const r = loadPlan(structuredClone(v8));

  test('открывается и переводится в текущую версию: прямоугольник остаётся прямоугольником', () => {
    expect(r.ok && r.migratedFrom).toBe('v8');
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
    const { version: _a, ...rest8 } = v8;
    const { version: _b, annexes: _ax, ...rest9 } = (r as { plan: Plan }).plan;
    expect(noBw(rest9)).toEqual(noBw(rest8));
  });
});

describe('файл версии 9 (этап 12, до соседних помещений)', () => {
  const r = loadPlan(structuredClone(v9));
  test('открывается: соседних помещений нет, остальное без изменений', () => {
    expect(r.ok && r.migratedFrom).toBe('v9');
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
    expect(r.ok && r.plan.annexes).toEqual([]);
    const { version: _a, ...rest9 } = v9;
    const { version: _b, annexes: _c, ...rest10 } = (r as { plan: Plan }).plan;
    expect(noBw(rest10)).toEqual(noBw(rest9));
  });
});

describe('файл версии 10 (этап 12, до цветного листа)', () => {
  const r = loadPlan(structuredClone(v10));
  test('открывается: лист цветной, остальное без изменений', () => {
    expect(r.ok && r.migratedFrom).toBe('v10');
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
    expect(r.ok && r.plan.sheet.bw).toBe(false);
    const { version: _a, sheet: sa, ...rest10 } = v10;
    const { version: _b, sheet: sb, ...rest11 } = (r as { plan: Plan }).plan;
    expect(noBw(rest11)).toEqual(noBw(rest10));
    expect({ ...sb, bw: undefined }).toEqual({ ...sa, bw: undefined });
  });
});

describe('файл версии 11 (этап 12, развёртки на местах)', () => {
  test('открывается без изменений', () => {
    const r = loadPlan(structuredClone(v11));
    expect(r.ok && r.migratedFrom).toBe('v11');
    expect(r.ok && r.plan.version).toBe(12);
    const { version: _a, ...rest11 } = v11;
    const { version: _b, ...rest12 } = (r as { plan: Plan }).plan;
    expect(rest12).toEqual(rest11);
  });
});

describe('чистый лист (формат 9)', () => {
  test('план без стен открывается', () => {
    const p = { ...v11to12(v10to11(v9to10(v8to9(structuredClone(v8))))), room: { walls: [], height: v8.room.height } };
    expect(loadPlan(JSON.parse(JSON.stringify(p)))).toEqual({ ok: true, plan: p });
  });
  test('две стены — не помещение', () => {
    const p = { ...v8to9(structuredClone(v8)), room: { walls: v8.room.walls.slice(0, 2), height: v8.room.height } };
    expect(loadPlan(p).ok).toBe(false);
  });
});

describe('файл версии 3 (этап 5)', () => {
  const r = loadPlan(structuredClone(v3));

  test('открывается и переводится в текущую версию', () => {
    expect(r.ok && r.migratedFrom).toBe('v3');
    expect(r.ok && r.plan.version).toBe(FORMAT_VERSION);
  });

  test('названия приборов пустые, остальное без изменений', () => {
    const { version: _a, ...rest3 } = v3;
    const { version: _b, annexes: _ax, instruments, wallPhotos: _c, ...rest4 } = (r as { plan: Plan }).plan;
    expect(instruments).toEqual({ tape: '', rangefinder: '' });
    expect(noBw(rest4)).toEqual(noBw(rest3));
  });
});

describe('loadPlan', () => {
  const p = v11to12(v10to11(v9to10(v8to9(v7to8(v6to7(v5to6(v4to5(v3to4(v2to3(v1to2(fromPrototype(structuredClone(old)))))))))))));

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
