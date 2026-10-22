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
export type PlanV1 = Omit<Plan, 'version' | 'sheet'> & {
  version: 1;
  sheet: { mode: 'schematic' | 'scale'; scale: number; showDims: boolean; showTies: boolean };
};

const NOT_A_PLAN = 'Это не файл проекта плана';

/** Переводы на одну версию вперёд: ключ — версия, из которой переводим */
const UPGRADES: Record<number, (o: Record<string, unknown>) => Record<string, unknown>> = {
  1: o => v1to2(o as unknown as PlanV1) as unknown as Record<string, unknown>,
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
export function v1to2(p: PlanV1): Plan {
  const { showDims: _, ...sheet } = p.sheet;
  return { ...p, version: 2, sheet: { paper: 'A3', ...sheet } };
}

function checkShape(o: Record<string, unknown>): boolean {
  const room = o.room as { walls?: unknown; height?: unknown } | undefined;
  return !!room && Array.isArray(room.walls) && room.walls.length >= 3 && !!room.height &&
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
