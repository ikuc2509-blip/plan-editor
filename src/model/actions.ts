// Действия над планом. Каждое возвращает новый план и не трогает старый:
// так старые состояния можно хранить для отмены и повтора.
// Неизменённые части переиспользуются (подложка-картинка не копируется).
import type {
  Callout, Dim, Item, ItemType, Marker, MeasureMethod, Mm, Photo, Plan, Point, SheetOptions, Stamp, Underlay, WallItem, WallItemType,
} from './types';
import { IT_SIZE } from './labels';
import { findWall, rectSize, rectWalls, wallLength } from './room';
import { cond, withMm } from './units';

type Collection = 'wallItems' | 'items' | 'markers' | 'callouts' | 'photos';
export type ElemOf<C extends Collection> =
  C extends 'wallItems' ? WallItem : C extends 'items' ? Item : C extends 'markers' ? Marker : C extends 'callouts' ? Callout : Photo;

/** Условное значение масштабируется, замеренное остаётся */
const scaleCond = (d: Dim, k: number): Dim => (d.status === 'conditional' && k !== 1 ? withMm(d, d.mm * k) : d);
const ratio = (now: Mm, was: Mm): number => (was > 0 ? now / was : 1);

/**
 * Новые размеры прямоугольного помещения. Условные объекты сдвигаются пропорционально
 * (только положение, не размеры — см. decisions.md), замеренные остаются на месте.
 */
export function setRoomSize(p: Plan, size: { L?: Mm; W?: Mm; h?: Mm }): Plan {
  const { L, W } = rectSize(p.room);
  const nL = size.L !== undefined ? withMm(L, size.L) : L;
  const nW = size.W !== undefined ? withMm(W, size.W) : W;
  const nh = size.h !== undefined ? withMm(p.room.height, size.h) : p.room.height;
  const names = Object.fromEntries(p.room.walls.map(w => [w.id, w.name]));
  const walls = rectWalls(nL, nW, names);
  const kx = ratio(nL.mm, L.mm), ky = ratio(nW.mm, W.mm), kz = ratio(nh.mm, p.room.height.mm);
  // коэффициент вдоль стены: для А и Б — по длине, для В и Г — по ширине
  const kWall = (wallId: string) => {
    const was = findWall(p.room, wallId), now = walls.find(w => w.id === wallId);
    return was && now ? ratio(wallLength(now), wallLength(was)) : 1;
  };
  return {
    ...p,
    room: { walls, height: nh },
    wallItems: p.wallItems.map(it => ({ ...it, off: scaleCond(it.off, kWall(it.wallId)), z: scaleCond(it.z, kz) })),
    items: p.items.map(it => ({ ...it, x: scaleCond(it.x, kx), y: scaleCond(it.y, ky) })),
    markers: p.markers.map(m => ({
      ...m, x: scaleCond(m.x, kx), y: scaleCond(m.y, ky), off: scaleCond(m.off, kWall(m.wallId)), z: scaleCond(m.z, kz),
    })),
  };
}

/**
 * Отметить размер помещения замеренным или условным. Длина L — стены А и Б, ширина W — стены В и Г.
 * Способ не задан — прежний или рулетка.
 */
export function setRoomDimStatus(p: Plan, which: 'L' | 'W' | 'h', isMeasured: boolean, method?: MeasureMethod): Plan {
  const mark = (d: Dim): Dim => (isMeasured ? { mm: d.mm, status: 'measured', method: method ?? d.method ?? 'tape' } : { mm: d.mm, status: 'conditional' });
  if (which === 'h') return { ...p, room: { ...p.room, height: mark(p.room.height) } };
  const ids = which === 'L' ? ['A', 'B'] : ['V', 'G'];
  return { ...p, room: { ...p.room, walls: p.room.walls.map(w => (ids.includes(w.id) ? { ...w, length: mark(w.length) } : w)) } };
}

export function setWallName(p: Plan, wallId: string, name: string): Plan {
  return { ...p, room: { ...p.room, walls: p.room.walls.map(w => (w.id === wallId ? { ...w, name } : w)) } };
}

export const setSheet = (p: Plan, o: Partial<SheetOptions>): Plan => ({ ...p, sheet: { ...p.sheet, ...o } });
export const setStamp = (p: Plan, o: Partial<Stamp>): Plan => ({ ...p, stamp: { ...p.stamp, ...o } });
export const setUnderlay = (p: Plan, o: Partial<Underlay>): Plan => ({ ...p, underlay: { ...p.underlay, ...o } });
export const setNorth = (p: Plan, north: string): Plan => ({ ...p, north });
export const setNotes = (p: Plan, notes: string): Plan => ({ ...p, notes });
export const setInstruments = (p: Plan, o: Partial<Plan['instruments']>): Plan => ({ ...p, instruments: { ...p.instruments, ...o } });

/** Поменять поля одного объекта по id */
export function patch<C extends Collection>(p: Plan, col: C, id: string, o: Partial<ElemOf<C>>): Plan {
  const list = p[col] as ElemOf<C>[];
  return { ...p, [col]: list.map(e => (e.id === id ? { ...e, ...o } : e)) };
}

/** Длины объектов, которые можно поменять одним числом, мм */
export type DimPatch = Partial<Record<'off' | 'z' | 'w' | 'h' | 'x' | 'y' | 'd', Mm>>;

/** Поменять длину в объекте: статус и способ замера сохраняются */
export function patchDims(p: Plan, col: Collection, id: string, mm: DimPatch): Plan {
  const list = p[col] as { id: string }[];
  return {
    ...p,
    [col]: list.map(e => {
      if (e.id !== id) return e;
      const next: Record<string, unknown> = { ...e };
      for (const [k, v] of Object.entries(mm)) {
        const d = (e as Record<string, unknown>)[k] as Dim | undefined;
        if (d) next[k] = withMm(d, v);
      }
      return next;
    }),
  };
}

/** Перетаскивание: новое положение уже не равно замеру, поэтому становится условным */
export function moveTo(p: Plan, col: Collection, id: string, mm: DimPatch): Plan {
  const o: Record<string, Dim> = {};
  for (const [k, v] of Object.entries(mm)) o[k] = cond(v);
  return patch(p, col, id, o);
}

export function remove(p: Plan, col: Collection, id: string): Plan {
  return { ...p, [col]: (p[col] as { id: string }[]).filter(x => x.id !== id) };
}

export function addWallItem(p: Plan, id: string, type: WallItemType, wallId: string): Plan {
  const o: WallItem = {
    id, wallId, type, label: '',
    off: cond(500),
    z: cond(type === 'door' ? 0 : type === 'radiator' ? 150 : 900),
    w: cond(type === 'door' ? 1000 : 1200),
    h: cond(type === 'door' ? 2100 : type === 'radiator' ? 600 : 1500),
    open: false, hinge: 'start', origin: { kind: 'manual' },
  };
  return { ...p, wallItems: [...p.wallItems, o] };
}

/** Новый предмет типовых размеров — в середине помещения */
export function addItem(p: Plan, id: string, type: ItemType = 'table'): Plan {
  const { L, W } = rectSize(p.room);
  const [w, d] = IT_SIZE[type];
  const o: Item = {
    id, type, label: '', x: cond(Math.round((L.mm - w) / 2)), y: cond(Math.round((W.mm - d) / 2)), w: cond(w), d: cond(d),
    angle: 0, origin: { kind: 'manual' },
  };
  return { ...p, items: [...p.items, o] };
}

/** Угол поворота предмета: приводится к 0…360, до десятых долей градуса */
export function setAngle(p: Plan, id: string, deg: number): Plan {
  if (!Number.isFinite(deg)) return p;
  const a = Math.round((((deg % 360) + 360) % 360) * 10) / 10;
  return patch(p, 'items', id, { angle: a === 360 ? 0 : a });
}

/** Следующий номер снимка — на единицу больше наибольшего; дальше номер правит пользователь */
export function nextPhotoNumber(p: Plan): string {
  return String(p.photos.reduce((m, k) => Math.max(m, parseInt(k.n) || 0), 0) + 1);
}

export const addPhotos = (p: Plan, list: Photo[]): Plan => (list.length ? { ...p, photos: [...p.photos, ...list] } : p);

/** Новая выноска: подпись правее и выше середины помещения, стрелка — в середину */
export function addCallout(p: Plan, id: string, text = ''): Plan {
  const { L, W } = rectSize(p.room);
  const target: Point = { x: Math.round(L.mm / 2), y: Math.round(W.mm / 2) };
  const o: Callout = { id, text, at: { x: target.x + 800, y: target.y - 800 }, target, origin: { kind: 'manual' } };
  return { ...p, callouts: [...p.callouts, o] };
}

/** Новая метка получает номер на единицу больше наибольшего; дальше номер правит пользователь */
export function addMarker(p: Plan, id: string, wallId: string): Plan {
  const { L, W } = rectSize(p.room);
  const n = String(p.markers.reduce((m, k) => Math.max(m, parseInt(k.n) || 0), 0) + 1);
  const o: Marker = {
    id, n, desc: '', place: 'floor', x: cond(L.mm / 2), y: cond(W.mm / 2),
    wallId, off: cond(1000), z: cond(1000), origin: { kind: 'manual' },
  };
  return { ...p, markers: [...p.markers, o] };
}

export interface RowsParams {
  rows: number;
  x0: Mm;
  step: Mm;
  depth: Mm;
  margin: Mm;
  aisle: Mm;
}

/** Две колонки парт с центральным проходом */
export function addRows(p: Plan, r: RowsParams, newId: () => string): Plan {
  const { W } = rectSize(p.room);
  const colW = (W.mm - 2 * r.margin - r.aisle) / 2;
  const desk = (x: Mm, y: Mm): Item => ({
    id: newId(), type: 'desk', label: '', x: cond(x), y: cond(y), w: cond(r.depth), d: cond(colW),
    angle: 0, origin: { kind: 'manual' },
  });
  const added: Item[] = [];
  for (let i = 0; i < r.rows; i++) {
    const x = r.x0 + i * r.step;
    added.push(desk(x, r.margin), desk(x, r.margin + colW + r.aisle));
  }
  return { ...p, items: [...p.items, ...added] };
}

export const removeDesks = (p: Plan): Plan => ({ ...p, items: p.items.filter(i => i.type !== 'desk') });
