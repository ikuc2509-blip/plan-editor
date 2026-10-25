// Замеры (этап 6, облегчённый вариант): какой размер замерен и чем, ввод замера,
// чек-лист незамеренного, строка «Замеры произведены…» для примечаний.
import type { Dim, DimStatus, Marker, MeasureMethod, Mm, Plan } from './types';
import { IT_TYPES, WI_TYPES } from './labels';
import { findWall, isRect, noRoom, rectSize } from './room';
import { allWalls, patch, setAnnexWallLength, setRoomDimStatus, setRoomSize, setWallLength, setWallStatus } from './actions';
import { annexName } from './room';

/** Какой размер замеряем */
export type MeasureRef =
  | { t: 'room'; key: 'L' | 'W' | 'h' }
  /** длина стены нарисованной комнаты (этап 12) */
  | { t: 'wall'; id: string }
  | { t: 'obj'; col: 'wallItems' | 'items' | 'markers'; id: string; key: 'off' | 'z' | 'w' | 'h' | 'x' | 'y' | 'd' }
  /** привязка метки на полу к ближайшей стене: по X — к ближайшей вертикальной, по Y — к горизонтальной */
  | { t: 'tie'; id: string; axis: 'x' | 'y' };

export const METHODS: Record<MeasureMethod, string> = { tape: 'рулетка', rangefinder: 'лазерный дальномер', ar: 'камера телефона (AR)' };
/** способы, которые можно выбрать в v1 (decisions.md) */
export const METHODS_V1: MeasureMethod[] = ['tape', 'rangefinder'];

export function makeDim(mm: Mm, status: DimStatus, method: MeasureMethod = 'tape'): Dim {
  return status === 'measured' ? { mm: Math.round(mm), status, method } : { mm: Math.round(mm), status: 'conditional' };
}

/**
 * К какой стене привязка метки и расстояние до неё — так же, как рисуется на листе:
 * по X — ближайшая вертикальная стена напротив метки, по Y — горизонтальная.
 * dir — в какую сторону от стены метка (+1 — дальше от начала координат). null — подходящей стены нет.
 */
export function tieOf(p: Plan, m: Marker, axis: 'x' | 'y'): { wallId: string; letter: string; far: boolean; mm: Mm; at: Mm; dir: 1 | -1 } | null {
  const v = axis === 'x' ? m.x.mm : m.y.mm, other = axis === 'x' ? m.y.mm : m.x.mm;
  let best: { wallId: string; letter: string; far: boolean; mm: Mm; at: Mm; dir: 1 | -1 } | null = null;
  // стены и соседних помещений (этап 12): метка в подсобке привязывается к её стенам
  for (const w of allWalls(p)) {
    const along = axis === 'x' ? w.a.x === w.b.x : w.a.y === w.b.y;
    if (!along) continue;
    const at = axis === 'x' ? w.a.x : w.a.y;
    const lo = axis === 'x' ? Math.min(w.a.y, w.b.y) : Math.min(w.a.x, w.b.x), hi = axis === 'x' ? Math.max(w.a.y, w.b.y) : Math.max(w.a.x, w.b.x);
    if (other < lo || other > hi) continue;
    const dist = Math.abs(v - at);
    // при равенстве — ближняя к началу координат стена (как раньше у прямоугольника)
    if (!best || dist < best.mm || (dist === best.mm && at < best.at)) {
      const dir = v >= at ? 1 : -1;
      best = { wallId: w.id, letter: w.letter, far: dir < 0, mm: dist, at, dir };
    }
  }
  return best;
}

export interface MeasureInfo {
  /** что за объект: «Окно «1», стена А» */
  title: string;
  /** что за размер: «ширина» */
  what: string;
  /** значение, которое видит и вводит человек (для привязки — расстояние до стены) */
  mm: Mm;
  dim: Dim;
}

const OBJ_WHAT: Record<string, string> = { off: 'отступ от левого угла', z: 'от пола', w: 'ширина', h: 'высота', x: 'X', y: 'Y', d: 'по Y' };

/** Сведения о размере; null — объекта уже нет */
export function readMeasure(p: Plan, ref: MeasureRef): MeasureInfo | null {
  if (ref.t === 'wall') {
    const w = findWall(p.room, ref.id);
    if (w) return { title: 'Помещение', what: `стена ${w.letter}`, mm: w.length.mm, dim: w.length };
    const a = p.annexes.find(x => x.walls.some(k => k.id === ref.id)), aw = a?.walls.find(k => k.id === ref.id);
    return a && aw ? { title: annexName(p, a.id), what: `стена ${aw.letter}`, mm: aw.length.mm, dim: aw.length } : null;
  }
  if (ref.t === 'room') {
    if (ref.key === 'h') return { title: 'Помещение', what: 'высота h', mm: p.room.height.mm, dim: p.room.height };
    if (!isRect(p.room)) return null;
    const { L, W } = rectSize(p.room);
    if (ref.key === 'L') return { title: 'Помещение', what: 'длина L (стены А и Б)', mm: L.mm, dim: L };
    return { title: 'Помещение', what: 'ширина W (стены В и Г)', mm: W.mm, dim: W };
  }
  if (ref.t === 'tie') {
    const m = p.markers.find(k => k.id === ref.id);
    if (!m) return null;
    const tie = tieOf(p, m, ref.axis);
    if (!tie) return null;
    return { title: `Метка № ${m.n}`, what: `до стены ${tie.letter}`, mm: tie.mm, dim: ref.axis === 'x' ? m.x : m.y };
  }
  const list = p[ref.col] as unknown as ({ id: string } & Record<string, unknown>)[];
  const o = list.find(k => k.id === ref.id);
  const dim = o?.[ref.key] as Dim | undefined;
  if (!o || !dim) return null;
  let title: string, what = OBJ_WHAT[ref.key]!;
  if (ref.col === 'wallItems') {
    const it = p.wallItems.find(k => k.id === ref.id)!;
    title = `${WI_TYPES[it.type]}${it.label ? ` «${it.label}»` : ''}, стена ${findWall(p.room, it.wallId)?.letter ?? ''}`;
  } else if (ref.col === 'items') {
    const it = p.items.find(k => k.id === ref.id)!;
    title = IT_TYPES[it.type] + (it.label ? ` «${it.label}»` : '');
    if (ref.key === 'w') what = 'по X';
  } else {
    title = `Метка № ${p.markers.find(k => k.id === ref.id)!.n}`;
    if (ref.key === 'off') what = 'отступ на стене';
  }
  return { title, what, mm: dim.mm, dim };
}

/**
 * Записать замер одним действием (один шаг отмены). Для помещения новый размер
 * сдвигает условные объекты пропорционально — как при вводе в поле.
 */
export function applyMeasure(p: Plan, ref: MeasureRef, mm: Mm, status: DimStatus, method: MeasureMethod = 'tape'): Plan {
  const d = makeDim(mm, status, method);
  if (ref.t === 'wall') {
    const w = findWall(p.room, ref.id);
    if (w) return setWallStatus(w.length.mm !== mm ? setWallLength(p, ref.id, mm) : p, ref.id, status === 'measured', method);
    const aw = p.annexes.flatMap(a => a.walls).find(k => k.id === ref.id);
    if (!aw) return p;
    return setWallStatus(aw.length.mm !== mm ? setAnnexWallLength(p, ref.id, mm) : p, ref.id, status === 'measured', method);
  }
  if (ref.t === 'room') {
    const cur = readMeasure(p, ref)?.mm;
    if (cur === undefined) return p;
    const q = cur !== mm ? setRoomSize(p, { [ref.key]: mm }) : p;
    return setRoomDimStatus(q, ref.key, status === 'measured', method);
  }
  if (ref.t === 'tie') {
    const m = p.markers.find(k => k.id === ref.id);
    if (!m) return p;
    const tie = tieOf(p, m, ref.axis);
    if (!tie) return p;
    return patch(p, 'markers', m.id, { [ref.axis]: makeDim(tie.at + tie.dir * mm, status, method) });
  }
  return patch(p, ref.col, ref.id, { [ref.key]: d });
}

export interface MeasureRow extends MeasureInfo {
  ref: MeasureRef;
  group: 'Помещение' | 'Окна и двери' | 'Метки';
  /** id объекта — подсветить на листе */
  sel?: { kind: 'wi' | 'mk'; id: string };
}

/** Чек-лист: размеры помещения, окон и дверей, положение меток (TODO, этап 6) */
export function measureList(p: Plan): MeasureRow[] {
  const rows: MeasureRow[] = [];
  const add = (ref: MeasureRef, group: MeasureRow['group'], sel?: MeasureRow['sel']) => {
    const info = readMeasure(p, ref);
    if (info) rows.push({ ...info, ref, group, ...(sel ? { sel } : {}) });
  };
  if (isRect(p.room)) for (const key of ['L', 'W'] as const) add({ t: 'room', key }, 'Помещение');
  else for (const w of p.room.walls) add({ t: 'wall', id: w.id }, 'Помещение');
  if (!noRoom(p.room)) add({ t: 'room', key: 'h' }, 'Помещение');
  for (const a of p.annexes) for (const w of a.walls) add({ t: 'wall', id: w.id }, 'Помещение');
  for (const it of p.wallItems) {
    if (it.type !== 'window' && it.type !== 'door') continue;
    const keys = it.type === 'window' ? (['off', 'w', 'h', 'z'] as const) : (['off', 'w', 'h'] as const);
    for (const key of keys) add({ t: 'obj', col: 'wallItems', id: it.id, key }, 'Окна и двери', { kind: 'wi', id: it.id });
  }
  for (const m of p.markers) {
    const sel = { kind: 'mk', id: m.id } as const;
    if (m.place === 'floor') { add({ t: 'tie', id: m.id, axis: 'x' }, 'Метки', sel); add({ t: 'tie', id: m.id, axis: 'y' }, 'Метки', sel); }
    else {
      add({ t: 'obj', col: 'markers', id: m.id, key: 'off' }, 'Метки', sel);
      if (m.place === 'wall') add({ t: 'obj', col: 'markers', id: m.id, key: 'z' }, 'Метки', sel);
    }
  }
  return rows;
}

/** Все размеры плана, которые видны на листе — по ним собираются применённые приборы */
function allDims(p: Plan): Dim[] {
  return [
    ...p.room.walls.map(w => w.length), p.room.height,
    ...p.wallItems.flatMap(i => [i.off, i.z, i.w, i.h]),
    ...p.items.flatMap(i => [i.x, i.y, i.w, i.d]),
    ...p.markers.flatMap(m => (m.place === 'floor' ? [m.x, m.y] : m.place === 'wall' ? [m.off, m.z] : [m.off])),
  ];
}

const BLANK = '______________';

/** «Замеры произведены: рулетка измерительная 5 м; лазерный дальномер Bosch GLM 50-27.» null — замеров нет */
export function measureNote(p: Plan): string | null {
  const used = new Set(allDims(p).filter(d => d.status === 'measured').map(d => d.method ?? 'tape'));
  const order: MeasureMethod[] = ['tape', 'rangefinder', 'ar'];
  const parts = order.filter(k => used.has(k)).map(k => {
    const name = k === 'ar' ? '' : (p.instruments?.[k] ?? '').trim();
    return k === 'ar' ? METHODS.ar : `${METHODS[k]} ${name || BLANK}`;
  });
  return parts.length ? `Замеры произведены: ${parts.join('; ')}.` : null;
}
