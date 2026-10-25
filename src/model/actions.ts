// Действия над планом. Каждое возвращает новый план и не трогает старый:
// так старые состояния можно хранить для отмены и повтора.
// Неизменённые части переиспользуются (подложка-картинка не копируется).
import type {
  Callout, Dim, FrameEdge, Item, ItemType, Marker, MeasureMethod, Mm, Origin, Photo, Plan, Point, SheetOptions, Stamp, Underlay, WallItem, WallItemType, WallPhoto,
} from './types';
import { IT_SIZE } from './labels';
import { createRectRoom, findWall, isRect, polygonWalls, rectSize, rectWalls, roomExtent, wallLength } from './room';
import { cond, withMm } from './units';

type Collection = 'wallItems' | 'items' | 'markers' | 'callouts' | 'photos' | 'wallPhotos';
export type ElemOf<C extends Collection> =
  C extends 'wallItems' ? WallItem : C extends 'items' ? Item : C extends 'markers' ? Marker : C extends 'callouts' ? Callout : C extends 'photos' ? Photo : WallPhoto;

/** Условное значение масштабируется, замеренное остаётся */
const scaleCond = (d: Dim, k: number): Dim => (d.status === 'conditional' && k !== 1 ? withMm(d, d.mm * k) : d);
const ratio = (now: Mm, was: Mm): number => (was > 0 ? now / was : 1);
const scaleEdge = (e: FrameEdge, k: number): FrameEdge => (e.kind === 'mark' ? { kind: 'mark', off: scaleCond(e.off, k) } : e);

/**
 * Новые размеры прямоугольного помещения. Условные объекты сдвигаются пропорционально
 * (только положение, не размеры — см. decisions.md), замеренные остаются на месте.
 */
export function setRoomSize(p: Plan, size: { L?: Mm; W?: Mm; h?: Mm }): Plan {
  // у нарисованной комнаты нет L и W — меняется только высота
  if (!isRect(p.room)) return size.h !== undefined ? setHeight(p, size.h) : p;
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
    // ориентиры краёв кадров на стенах — как отступы на стене
    wallPhotos: p.wallPhotos.map(wp => ({
      ...wp, left: scaleEdge(wp.left, kWall(wp.wallId)), right: scaleEdge(wp.right, kWall(wp.wallId)),
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

/** Элемент стены, обведённый по снимку (этап 9): положение и размеры «условно», происхождение — снимок и рамка */
export function addTracedWallItem(p: Plan, id: string, type: WallItemType, wallId: string, r: { off: Mm; z: Mm; w: Mm; h: Mm }, origin: Origin): Plan {
  const q = addWallItem(p, id, type, wallId);
  return patch(q, 'wallItems', id, { off: cond(r.off), z: cond(r.z), w: cond(r.w), h: cond(r.h), origin });
}

/** Новый предмет типовых размеров — в середине помещения */
export function addItem(p: Plan, id: string, type: ItemType = 'table'): Plan {
  const c = floorCenter(p);
  const [w, d] = IT_SIZE[type];
  const o: Item = {
    id, type, label: '', x: cond(Math.round(c.x - w / 2)), y: cond(Math.round(c.y - d / 2)), w: cond(w), d: cond(d),
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
  const target: Point = floorCenter(p);
  const o: Callout = { id, text, at: { x: target.x + 800, y: target.y - 800 }, target, origin: { kind: 'manual' } };
  return { ...p, callouts: [...p.callouts, o] };
}

/** Новая метка получает номер на единицу больше наибольшего; дальше номер правит пользователь */
export function addMarker(p: Plan, id: string, wallId: string): Plan {
  const c = floorCenter(p);
  const n = String(p.markers.reduce((m, k) => Math.max(m, parseInt(k.n) || 0), 0) + 1);
  const o: Marker = {
    id, n, desc: '', place: 'floor', x: cond(c.x), y: cond(c.y),
    wallId, off: cond(1000), z: cond(1000), origin: { kind: 'manual' },
  };
  return { ...p, markers: [...p.markers, o] };
}

/** Место новой метки на плане: пол или развёртка стены, мм */
export type MarkerAt =
  | { place: 'floor'; x: Mm; y: Mm }
  | { place: 'wall'; wallId: string; off: Mm; z: Mm };

/** Новая метка там, куда коснулись на плане («На месте», этап 8); положение — «условно» */
export function addMarkerAt(p: Plan, id: string, at: MarkerAt): Plan {
  const q = addMarker(p, id, at.place === 'wall' ? at.wallId : 'A');
  return at.place === 'wall'
    ? patch(q, 'markers', id, { place: 'wall', off: cond(at.off), z: cond(at.z) })
    : patch(q, 'markers', id, { x: cond(at.x), y: cond(at.y) });
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
  const e = roomExtent(p.room);
  const colW = (e.maxY - e.minY - 2 * r.margin - r.aisle) / 2;
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

/* снимки на развёртке стен (этап 9) */

export const addWallPhoto = (p: Plan, wp: WallPhoto): Plan => ({ ...p, wallPhotos: [...p.wallPhotos, wp] });

/** Убрать снимок из проекта — вместе с его выпрямлениями на стенах */
export function removePhoto(p: Plan, id: string): Plan {
  return { ...p, photos: p.photos.filter(ph => ph.id !== id), wallPhotos: p.wallPhotos.filter(wp => wp.photoId !== id) };
}

/* ——— своя комната (этап 12) ——— */

/** Середина габарита пола — куда ставить новый предмет; чистый лист — условная середина 10 × 6 м */
export function floorCenter(p: Plan): Point {
  if (!p.room.walls.length) return { x: 5000, y: 3000 };
  const e = roomExtent(p.room);
  return { x: Math.round((e.minX + e.maxX) / 2), y: Math.round((e.minY + e.maxY) / 2) };
}

/** Высота помещения: условные высоты на стенах масштабируются, замеренные остаются */
export function setHeight(p: Plan, h: Mm): Plan {
  const kz = ratio(h, p.room.height.mm);
  return {
    ...p,
    room: { ...p.room, height: withMm(p.room.height, h) },
    wallItems: p.wallItems.map(it => ({ ...it, z: scaleCond(it.z, kz) })),
    markers: p.markers.map(m => ({ ...m, z: scaleCond(m.z, kz) })),
  };
}

/** Убрать всё, что держится за стены, которых больше нет */
function dropOrphans(p: Plan): Plan {
  const ok = (id: string) => p.room.walls.some(w => w.id === id);
  return {
    ...p,
    wallItems: p.wallItems.filter(it => ok(it.wallId)),
    markers: p.markers.filter(m => m.place === 'floor' || ok(m.wallId)),
    wallPhotos: p.wallPhotos.filter(wp => ok(wp.wallId)),
  };
}

/** Нарисованная комната: углы по порядку щелчков; обход и буквы приводятся к правилу листа */
export function drawRoom(p: Plan, pts: readonly Point[]): Plan {
  // достраиваем комнату — координаты пола не сдвигаем, иначе мебель и метки съедут
  const walls = polygonWalls(pts, !p.room.walls.length);
  if (!walls.length) return p;
  return dropOrphans({ ...p, room: { walls, height: p.room.height } });
}

/** Убрать комнату (нарисовать заново): окна, двери и метки на стенах уходят вместе со стенами */
export const clearRoom = (p: Plan): Plan => dropOrphans({ ...p, room: { walls: [], height: p.room.height } });

/** Заготовка: прямоугольник 10 × 6 м, дальше — как раньше (L, W, h) */
export const rectTemplate = (p: Plan): Plan => dropOrphans({ ...p, room: { ...createRectRoom(10_000, 6_000, p.room.height.mm), height: p.room.height } });

/** Стены заново по углам: длины пересчитываются; изменившаяся длина — условная */
function withCorners(p: Plan, pts: readonly Point[]): Plan {
  const walls = p.room.walls.map((w, i) => {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    return { ...w, a, b, length: len === w.length.mm ? w.length : cond(len) };
  });
  return { ...p, room: { ...p.room, walls } };
}

/**
 * Новая длина стены: комната растягивается по линии, перпендикулярной стене, через её середину —
 * всё, что дальше середины по направлению стены, сдвигается (как L и W у прямоугольника).
 * Условные предметы и метки на полу за этой линией сдвигаются тоже, замеренные остаются.
 */
export function setWallLength(p: Plan, wallId: string, mm: Mm): Plan {
  const i = p.room.walls.findIndex(w => w.id === wallId);
  const w = p.room.walls[i];
  if (!w || mm <= 0) return p;
  if (isRect(p.room)) return setRoomSize(p, w.id === 'A' || w.id === 'B' ? { L: mm } : { W: mm });
  const len = wallLength(w), d = mm - len;
  if (!len || !d) return p;
  const ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len;
  const cut = ((w.a.x + w.b.x) / 2) * ux + ((w.a.y + w.b.y) / 2) * uy;
  const beyond = (x: Mm, y: Mm) => x * ux + y * uy > cut;
  const shift = (pt: Point): Point => (beyond(pt.x, pt.y) ? { x: Math.round(pt.x + ux * d), y: Math.round(pt.y + uy * d) } : pt);
  let q = withCorners(p, p.room.walls.map(k => shift(k.a)));
  const sx = Math.round(ux * d), sy = Math.round(uy * d);
  const mv = <T extends { x: Dim; y: Dim }>(o: T): T => (beyond(o.x.mm, o.y.mm) && o.x.status === 'conditional' && o.y.status === 'conditional'
    ? { ...o, x: withMm(o.x, o.x.mm + sx), y: withMm(o.y, o.y.mm + sy) } : o);
  q = { ...q, items: q.items.map(mv), markers: q.markers.map(m => (m.place === 'floor' ? mv(m) : m)) };
  // сама стена — новая длина со статусом, который был
  return { ...q, room: { ...q.room, walls: q.room.walls.map(k => (k.id === wallId ? { ...k, length: withMm(w.length, mm) } : k)) } };
}

/** Стена замерена или условна */
export function setWallStatus(p: Plan, wallId: string, isMeasured: boolean, method?: MeasureMethod): Plan {
  return {
    ...p,
    room: {
      ...p.room,
      walls: p.room.walls.map(w => (w.id !== wallId ? w : {
        ...w, length: isMeasured ? { mm: w.length.mm, status: 'measured', method: method ?? w.length.method ?? 'tape' } : { mm: w.length.mm, status: 'conditional' },
      })),
    },
  };
}

/** Передвинуть угол комнаты (мышью): две стены у угла меняют длину — она становится условной */
export function moveCorner(p: Plan, index: number, pt: Point): Plan {
  if (index < 0 || index >= p.room.walls.length) return p;
  return withCorners(p, p.room.walls.map((w, i) => (i === index ? { x: Math.round(pt.x), y: Math.round(pt.y) } : w.a)));
}
