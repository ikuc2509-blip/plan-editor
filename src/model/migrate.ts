// Открытие сохранённого плана любой версии: определяем формат и переводим в текущий.
// Правило: при изменении формата — новая версия, новая функция перевода сюда и тест
// на открытие файла старой версии.
import type { ItemType, Plan, WallItemType } from './types';
import { FORMAT_ID, FORMAT_VERSION } from './types';
import type { ProtoPlan, ProtoWall } from './prototype';
import { rectWalls } from './room';
import { cond, toMm } from './units';

export type LoadResult = { ok: true; plan: Plan; migratedFrom?: string } | { ok: false; error: string };

/** Формат версии 1 (этап 1): без формата листа, с галочкой showDims */
export type PlanV1 = Omit<PlanV3, 'version' | 'sheet'> & {
  version: 1;
  sheet: { mode: 'schematic' | 'scale'; scale: number; showDims: boolean; showTies: boolean };
};

/** Формат версии 11 (этап 12): развёртки стен всегда на своих местах (wall.elev нет — так и было) */
export type PlanV11 = Omit<Plan, 'version'> & { version: 11 };
/** Формат версии 10 (этап 12): лист без выбора цветной / чёрно-белый */
export type PlanV10 = Omit<Plan, 'version' | 'sheet'> & { version: 10; sheet: Omit<Plan['sheet'], 'bw'> };
/** Формат версии 9 (этап 12): без соседних помещений */
export type PlanV9 = Omit<PlanV10, 'version' | 'annexes'> & { version: 9 };
/** Формат версии 8 (этап 11): как версия 9, только помещение — всегда прямоугольник */
export type PlanV8 = Omit<PlanV9, 'version'> & { version: 8 };
/** Формат версии 7 (этап 10): как версия 8, только без новых видов мебели и контура тела */
export type PlanV7 = Omit<PlanV8, 'version'> & { version: 7 };
/** Формат версии 6 (этап 9): как версия 7, только у объектов нет пометки «предложено моделью» */
export type PlanV6 = Omit<PlanV7, 'version'> & { version: 6 };
/** Формат версии 5 (этапы 7–8): без снимков на развёртке стен */
export type PlanV5 = Omit<PlanV6, 'version' | 'wallPhotos'> & { version: 5 };
/** Формат версии 4 (этап 6): снимок — только id и номер (заготовка) */
export type PlanV4 = Omit<PlanV5, 'version' | 'photos'> & { version: 4; photos: { id: string; n: string }[] };
/** Формат версии 3 (этап 5): без названий приборов */
export type PlanV3 = Omit<PlanV4, 'version' | 'instruments'> & { version: 3 };
/** Формат версии 2 (этапы 2–4): как версия 3, только без предметов квартиры */
export type PlanV2 = Omit<PlanV3, 'version'> & { version: 2 };

const NOT_A_PLAN = 'Это не файл проекта плана';

/** Переводы на одну версию вперёд: ключ — версия, из которой переводим */
const UPGRADES: Record<number, (o: Record<string, unknown>) => Record<string, unknown>> = {
  1: o => v1to2(o as unknown as PlanV1) as unknown as Record<string, unknown>,
  2: o => v2to3(o as unknown as PlanV2) as unknown as Record<string, unknown>,
  3: o => v3to4(o as unknown as PlanV3) as unknown as Record<string, unknown>,
  4: o => v4to5(o as unknown as PlanV4) as unknown as Record<string, unknown>,
  5: o => v5to6(o as unknown as PlanV5) as unknown as Record<string, unknown>,
  6: o => v6to7(o as unknown as PlanV6) as unknown as Record<string, unknown>,
  7: o => v7to8(o as unknown as PlanV7) as unknown as Record<string, unknown>,
  8: o => v8to9(o as unknown as PlanV8) as unknown as Record<string, unknown>,
  9: o => v9to10(o as unknown as PlanV9) as unknown as Record<string, unknown>,
  10: o => v10to11(o as unknown as PlanV10) as unknown as Record<string, unknown>,
  11: o => v11to12(o as unknown as PlanV11) as unknown as Record<string, unknown>,
};

/** Распознать сохранённый план и привести к текущей версии формата */
export function loadPlan(raw: unknown): LoadResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: NOT_A_PLAN };
  let o = raw as Record<string, unknown>;
  let migratedFrom: string | undefined;
  // прототип: номера версии нет, но есть помещение и элементы стен
  if (o.format === undefined && o.room && typeof o.room === 'object' && Array.isArray(o.wallItems)) {
    try {
      o = fromPrototype(raw as ProtoPlan) as unknown as Record<string, unknown>;
      migratedFrom = 'prototype';
    } catch {
      return { ok: false, error: 'Файл прототипа повреждён' };
    }
  }
  if (o.format !== FORMAT_ID || typeof o.version !== 'number') return { ok: false, error: NOT_A_PLAN };
  if (o.version > FORMAT_VERSION) return { ok: false, error: 'Файл сохранён более новой версией приложения. Обновите приложение.' };
  if (!checkShape(o)) return { ok: false, error: 'Файл проекта повреждён' };
  while ((o.version as number) < FORMAT_VERSION) {
    const v = o.version as number;
    const up = UPGRADES[v];
    if (!up) return { ok: false, error: NOT_A_PLAN };
    o = up(o);
    migratedFrom ??= 'v' + v;
  }
  return migratedFrom ? { ok: true, plan: o as unknown as Plan, migratedFrom } : { ok: true, plan: o as unknown as Plan };
}

/** 1 → 2: лист A3 (другого раньше не было); галочка «Подписывать размеры» больше не нужна */
export function v1to2(p: PlanV1): PlanV2 {
  const { showDims: _, ...sheet } = p.sheet;
  return { ...p, version: 2, sheet: { paper: 'A3', ...sheet } };
}

/** 2 → 3: появились новые виды предметов; старые данные подходят без изменений */
export function v2to3(p: PlanV2): PlanV3 {
  return { ...p, version: 3 };
}

/** 3 → 4: названия приборов ещё не вписаны */
export function v3to4(p: PlanV3): PlanV4 {
  return { ...p, version: 4, instruments: { tape: '', rangefinder: '' } };
}

/**
 * 4 → 5: снимков до этапа 7 не было (список всегда пуст); если что-то есть — без файла,
 * такой снимок покажется как «файл не найден».
 */
export function v4to5(p: PlanV4): PlanV5 {
  return {
    ...p, version: 5,
    photos: p.photos.map(ph => ({
      id: ph.id, n: ph.n, file: '', name: '', type: '', size: 0, sha256: '', kind: '', link: { kind: 'none' },
      takenAt: '', hasGps: false, addedAt: '', source: 'file', shot: '',
    })),
  };
}

/** 5 → 6: снимков на развёртке стен ещё нет */
export function v5to6(p: PlanV5): PlanV6 {
  return { ...p, version: 6, wallPhotos: [] };
}

/** 6 → 7: пометка «предложено моделью» необязательная — старые объекты созданы человеком */
export function v6to7(p: PlanV6): PlanV7 {
  return { ...p, version: 7 };
}

/** 7 → 8: появились новые виды мебели; старые данные подходят без изменений */
export function v7to8(p: PlanV7): PlanV8 {
  return { ...p, version: 8 };
}

/** 8 → 9: прямоугольник остаётся прямоугольником; новое — только чистый лист и нарисованные комнаты */
export function v8to9(p: PlanV8): PlanV9 {
  return { ...p, version: 9 };
}

/** 9 → 10: соседних помещений ещё нет */
export function v9to10(p: PlanV9): PlanV10 {
  return { ...p, version: 10, annexes: [] };
}

/** 10 → 11: лист — цветной, как образец (чёрно-белый включают для принтера без цвета) */
export function v10to11(p: PlanV10): PlanV11 {
  return { ...p, version: 11, sheet: { ...p.sheet, bw: false } };
}

/** 11 → 12: wall.elev необязательный — развёртки остаются на местах */
export function v11to12(p: PlanV11): Plan {
  return { ...p, version: 12 };
}

function checkShape(o: Record<string, unknown>): boolean {
  const room = o.room as { walls?: unknown; height?: unknown } | undefined;
  // стен нет — чистый лист (формат 9); иначе — хотя бы треугольник
  return !!room && Array.isArray(room.walls) && (room.walls.length === 0 || room.walls.length >= 3) && !!room.height &&
    ['wallItems', 'items', 'markers'].every(k => Array.isArray(o[k])) && !!o.stamp && !!o.sheet;
}

/**
 * Перевод из прототипа: метры → миллиметры, всё «условно» (замеров прототип не знал).
 * В прототипе отступ на стенах Б и В считался с другого конца — пересчитываем
 * от левого угла (стоя лицом к стене), петли меняем местами.
 */
export function fromPrototype(p: ProtoPlan): PlanV1 {
  const L = toMm(p.room.L), W = toMm(p.room.W), h = toMm(p.room.h);
  const names = p.wallNames ?? { A: '', B: '', V: '', G: '' };
  const walls = rectWalls(cond(L), cond(W), names);
  const len = (w: ProtoWall) => (w === 'A' || w === 'B' ? L : W);
  const reversed = (w: ProtoWall) => w === 'B' || w === 'V';
  /** отступ начала участка шириной width */
  const off = (w: ProtoWall, o: number, width = 0) => (reversed(w) ? len(w) - toMm(o) - toMm(width) : toMm(o));
  const u = p.underlay;

  return {
    format: FORMAT_ID,
    version: 1,
    room: { walls, height: cond(h) },
    wallItems: p.wallItems.map(it => ({
      id: it.id, wallId: it.wall, type: it.type as WallItemType, label: it.label ?? '',
      off: cond(off(it.wall, it.off, it.w)), z: cond(toMm(it.z)), w: cond(toMm(it.w)), h: cond(toMm(it.h)),
      open: !!it.open,
      hinge: reversed(it.wall) ? (it.hinge === 'end' ? 'start' : 'end') : (it.hinge === 'end' ? 'end' : 'start'),
      origin: { kind: 'manual' },
    })),
    items: (p.items ?? []).map(it => ({
      id: it.id, type: it.type as ItemType, label: it.label ?? '',
      x: cond(toMm(it.x)), y: cond(toMm(it.y)), w: cond(toMm(it.w)), d: cond(toMm(it.d)),
      angle: 0, origin: { kind: 'manual' },
    })),
    markers: (p.markers ?? []).map(m => ({
      id: m.id, n: String(m.n ?? ''), desc: m.desc ?? '', place: m.place,
      x: cond(toMm(m.x)), y: cond(toMm(m.y)),
      wallId: m.wall, off: cond(off(m.wall, m.off)), z: cond(toMm(m.z)),
      origin: { kind: 'manual' },
    })),
    callouts: [],
    photos: [],
    stamp: { ...p.stamp },
    north: p.north ?? '',
    notes: p.notes ?? '',
    underlay: u
      ? { src: u.src, show: u.show, opacity: u.opacity, scale: u.scale, dx: toMm(+u.dx || 0), dy: toMm(+u.dy || 0) }
      : { src: '', show: true, opacity: 0.45, scale: 100, dx: 0, dy: 0 },
    sheet: { mode: p.room.mode, scale: p.room.scale, showDims: p.room.showDims, showTies: p.room.showTies },
  };
}
