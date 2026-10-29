// Действия над планом. Каждое возвращает новый план и не трогает старый:
// так старые состояния можно хранить для отмены и повтора.
// Неизменённые части переиспользуются (подложка-картинка не копируется).
import type {
  Callout, Dim, FrameEdge, Item, ItemType, Marker, MeasureMethod, Mm, Origin, Photo, PhotoTableHead, Plan, Point, SheetOptions, Stamp, Underlay, Wall, WallElev, WallItem, WallItemType, WallPhoto,
} from './types';
import { IT_SIZE } from './labels';
import { LETTERS, createRectRoom, findWall, isRect, polygonWalls, rectSize, rectWalls, roomCorners, roomExtent, signedArea2, wallLength } from './room';
import { unionOrtho } from '../geometry/union';
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
  // соседние помещения за серединой помещения сдвигаются вместе со стенами (этап 12)
  const q0 = shiftAnnexes(shiftAnnexes(p, x => x > L.mm / 2, nL.mm - L.mm, 0), (_x, y) => y > W.mm / 2, 0, nW.mm - W.mm);
  return {
    ...q0,
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
/** шапка фототаблицы (формат 13) */
export const setPhotoTable = (p: Plan, o: Partial<PhotoTableHead>): Plan => ({ ...p, phototable: { ...p.phototable, ...o } });
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
  const wid = wallOr(p, wallId);
  const z = type === 'door' ? 0 : type === 'radiator' ? 150 : 900;
  const w = type === 'door' ? 1000 : 1200;
  const h = type === 'door' ? 2100 : type === 'radiator' ? 600 : 1500;
  const o: WallItem = {
    id, wallId: wid, type, label: '',
    off: cond(freeOff(p, wid, w, z, h)),
    z: cond(z), w: cond(w), h: cond(h),
    open: false, hinge: 'start', origin: { kind: 'manual' },
  };
  return { ...p, wallItems: [...p.wallItems, o] };
}

/**
 * Где на стене свободно для нового элемента шириной w: первое место от 0,5 м, не налезающее
 * на элементы той же высоты (радиатор под окном — можно). Места нет — 0,5 м, как раньше.
 */
function freeOff(p: Plan, wallId: string, w: Mm, z: Mm, h: Mm): Mm {
  const len = allWalls(p).find(k => k.id === wallId)?.length.mm ?? Infinity;
  const GAP = 300;
  const busy = p.wallItems
    .filter(i => i.wallId === wallId && i.z.mm < z + h && z < i.z.mm + i.h.mm)
    .map(i => [i.off.mm - GAP, i.off.mm + i.w.mm + GAP] as const);
  for (const at of [500, ...busy.map(b => b[1])].sort((a, b) => a - b)) {
    if (at + w > len - 200) continue;
    if (busy.every(([a, b]) => at + w <= a || at >= b)) return Math.round(at);
  }
  return 500;
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
    wallId: wallOr(p, wallId), off: cond(1000), z: cond(1000), origin: { kind: 'manual' },
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
  const ok = (id: string) => p.room.walls.some(w => w.id === id) || p.annexes.some(a => a.walls.some(w => w.id === id));
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
export const clearRoom = (p: Plan): Plan => dropOrphans({ ...p, room: { walls: [], height: p.room.height }, annexes: [] });

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
  const st = stretchPts(p.room.walls, w, mm);
  if (!st) return p;
  const { beyond, dx: sx, dy: sy } = st;
  let q = shiftAnnexes(withCorners(p, st.pts), beyond, sx, sy);
  const mv = <T extends { x: Dim; y: Dim }>(o: T): T => (beyond(o.x.mm, o.y.mm) && o.x.status === 'conditional' && o.y.status === 'conditional'
    ? { ...o, x: withMm(o.x, o.x.mm + sx), y: withMm(o.y, o.y.mm + sy) } : o);
  q = { ...q, items: q.items.map(mv), markers: q.markers.map(m => (m.place === 'floor' ? mv(m) : m)) };
  // сама стена — новая длина со статусом, который был
  return { ...q, room: { ...q.room, walls: q.room.walls.map(k => (k.id === wallId ? { ...k, length: withMm(w.length, mm) } : k)) } };
}

/** Стена замерена или условна */
export function setWallStatus(p: Plan, wallId: string, isMeasured: boolean, method?: MeasureMethod): Plan {
  const mark = (w: Wall): Wall => (w.id !== wallId ? w : {
    ...w, length: isMeasured ? { mm: w.length.mm, status: 'measured', method: method ?? w.length.method ?? 'tape' } : { mm: w.length.mm, status: 'conditional' },
  });
  // стена основного помещения или соседнего (этап 12)
  return { ...p, room: { ...p.room, walls: p.room.walls.map(mark) }, annexes: p.annexes.map(a => ({ ...a, walls: a.walls.map(mark) })) };
}

/** Передвинуть угол комнаты (мышью): две стены у угла меняют длину — она становится условной */
export function moveCorner(p: Plan, index: number, pt: Point): Plan {
  if (index < 0 || index >= p.room.walls.length) return p;
  return withCorners(p, p.room.walls.map((w, i) => (i === index ? { x: Math.round(pt.x), y: Math.round(pt.y) } : w.a)));
}

/**
 * «Выровнять стены»: каждая стена — по горизонтали или вертикали (что ближе), положение — среднее
 * её концов; подряд идущие стены одного направления сливаются в одну. Углы — пересечения соседних
 * стен, поэтому комната остаётся замкнутой. null — выровнять нельзя (меньше четырёх стен по осям).
 * id и названия стен сохраняются (окна и двери остаются на своих стенах), буквы — по порядку.
 */
export function straightenRoom(p: Plan): Plan | null {
  const ws = p.room.walls, n = ws.length;
  if (n < 4) return null;
  const horiz = ws.map(w => Math.abs(w.b.x - w.a.x) >= Math.abs(w.b.y - w.a.y));
  // начать с места, где направление меняется, — чтобы группа не разрывалась через конец списка
  const s = horiz.findIndex((h, i) => h !== horiz[(i - 1 + n) % n]);
  if (s < 0) return null;
  const groups: { h: boolean; idx: number[] }[] = [];
  for (let k = 0; k < n; k++) {
    const i = (s + k) % n, last = groups[groups.length - 1];
    if (last && last.h === horiz[i]) last.idx.push(i); else groups.push({ h: horiz[i]!, idx: [i] });
  }
  if (groups.length < 4 || groups.length % 2) return null;
  // линия группы: у горизонтальной — y, у вертикальной — x (среднее концов)
  const line = groups.map(g => {
    const vals = g.idx.flatMap(i => (g.h ? [ws[i]!.a.y, ws[i]!.b.y] : [ws[i]!.a.x, ws[i]!.b.x]));
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  });
  // конец группы k = пересечение её линии с линией следующей группы
  const end = (k: number): Point => {
    const k2 = (k + 1) % groups.length;
    return groups[k]!.h ? { x: line[k2]!, y: line[k]! } : { x: line[k]!, y: line[k2]! };
  };
  const walls = groups.map((g, k) => {
    const w = ws[g.idx[0]!]!, a = end((k - 1 + groups.length) % groups.length), b = end(k);
    const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    return { ...w, a, b, length: g.idx.length === 1 && len === w.length.mm ? w.length : cond(len) };
  });
  if (walls.some(w => w.length.mm <= 0)) return null;
  // буквы по порядку обхода, первая — верхняя левая (как у нарисованной комнаты)
  let first = 0;
  const mid = (w: { a: Point; b: Point }) => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });
  walls.forEach((w, i) => { const m = mid(w), f = mid(walls[first]!); if (m.y < f.y || (m.y === f.y && m.x < f.x)) first = i; });
  const ordered = [...walls.slice(first), ...walls.slice(0, first)].map((w, i) => ({ ...w, letter: LETTERS[i] ?? String(i + 1) }));
  return dropOrphans({ ...p, room: { ...p.room, walls: ordered } });
}

/** Есть ли косые стены (не по горизонтали и не по вертикали) */
export const hasSlanted = (p: Plan): boolean => p.room.walls.some(w => w.a.x !== w.b.x && w.a.y !== w.b.y);

/** Такой стены нет (у нарисованной комнаты нет стены «A») — первая стена основного помещения */
const wallOr = (p: Plan, id: string): string => (allWalls(p).some(w => w.id === id) ? id : p.room.walls[0]?.id ?? id);

/* ——— соседние помещения (этап 12, формат 10) ——— */

/** Все стены плана пола: основного помещения и соседних */
export const allWalls = (p: Plan): Wall[] => [...p.room.walls, ...p.annexes.flatMap(a => a.walls)];

/** Площадь многоугольника, мм² */
const area = (pts: readonly Point[]) => Math.abs(signedArea2(pts)) / 2;

export type AnnexResult = { ok: true; plan: Plan } | { ok: false; why: 'apart' | 'overlap' | 'slanted' | 'hole' };

/**
 * Соседнее помещение из прямоугольника: должно касаться основного (или другого соседнего) стороной
 * и не заходить внутрь. Координаты пола не сдвигаются.
 */
export function addAnnex(p: Plan, id: string, pts: readonly Point[], name = ''): AnnexResult {
  const polys = [roomCorners(p.room), ...p.annexes.map(a => a.walls.map(w => w.a))].filter(q => q.length);
  const u = unionOrtho([...polys, pts]);
  if (!u.ok) return { ok: false, why: u.why };
  // заходит внутрь — площадь объединения меньше суммы
  if (Math.abs(area(u.pts) - polys.reduce((s, q) => s + area(q), 0) - area(pts)) > 1) return { ok: false, why: 'overlap' };
  const walls = polygonWalls(pts, false).map(w => ({ ...w, id: `${id}-${w.id}` }));
  return { ok: true, plan: { ...p, annexes: [...p.annexes, { id, name, walls }] } };
}

export const renameAnnex = (p: Plan, id: string, name: string): Plan =>
  ({ ...p, annexes: p.annexes.map(a => (a.id === id ? { ...a, name } : a)) });

/** Убрать соседнее помещение: окна и двери на его стенах уходят вместе с ним */
export function removeAnnex(p: Plan, id: string): Plan {
  const gone = new Set(p.annexes.find(a => a.id === id)?.walls.map(w => w.id) ?? []);
  return { ...p, annexes: p.annexes.filter(a => a.id !== id), wallItems: p.wallItems.filter(it => !gone.has(it.wallId)), markers: p.markers.filter(m => m.place === 'floor' || !gone.has(m.wallId)) };
}

/**
 * Новая длина стены соседнего помещения: растягивается только оно (как у основного —
 * по линии через середину стены).
 */
export function setAnnexWallLength(p: Plan, wallId: string, mm: Mm): Plan {
  return {
    ...p,
    annexes: p.annexes.map(a => {
      const w = a.walls.find(k => k.id === wallId);
      if (!w || mm <= 0) return a;
      const st = stretchPts(a.walls, w, mm);
      if (!st) return a;
      const walls = a.walls.map((k, i) => {
        const aa = st.pts[i]!, bb = st.pts[(i + 1) % st.pts.length]!, len = Math.round(Math.hypot(bb.x - aa.x, bb.y - aa.y));
        return { ...k, a: aa, b: bb, length: k.id === wallId ? withMm(k.length, mm) : len === k.length.mm ? k.length : cond(len) };
      });
      return { ...a, walls };
    }),
  };
}

/** Сделать основным: его стены разворачиваются, прежнее основное становится соседним */
export function makeMain(p: Plan, id: string): Plan {
  const a = p.annexes.find(x => x.id === id);
  if (!a || !p.room.walls.length) return p;
  const old = { id: 'main-' + id, name: '', walls: p.room.walls };
  return { ...p, room: { ...p.room, walls: a.walls }, annexes: [...p.annexes.filter(x => x.id !== id), old] };
}

/** Углы после растяжения по линии через середину стены w (общее для основного и соседних) */
function stretchPts(walls: readonly Wall[], w: Wall, mm: Mm): { pts: Point[]; beyond: (x: Mm, y: Mm) => boolean; dx: Mm; dy: Mm } | null {
  const len = wallLength(w), d = mm - len;
  if (!len || !d) return null;
  const ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len;
  const cut = ((w.a.x + w.b.x) / 2) * ux + ((w.a.y + w.b.y) / 2) * uy;
  const beyond = (x: Mm, y: Mm) => x * ux + y * uy > cut;
  const dx = Math.round(ux * d), dy = Math.round(uy * d);
  return { pts: walls.map(k => (beyond(k.a.x, k.a.y) ? { x: k.a.x + dx, y: k.a.y + dy } : k.a)), beyond, dx, dy };
}

/** Соседние помещения за линией растяжения основного сдвигаются вместе с ним — перегородки остаются на местах */
function shiftAnnexes(p: Plan, beyond: (x: Mm, y: Mm) => boolean, dx: Mm, dy: Mm): Plan {
  if (!p.annexes.length) return p;
  return {
    ...p,
    annexes: p.annexes.map(a => {
      const pts = a.walls.map(k => (beyond(k.a.x, k.a.y) ? { x: k.a.x + dx, y: k.a.y + dy } : k.a));
      return {
        ...a,
        walls: a.walls.map((k, i) => {
          const aa = pts[i]!, bb = pts[(i + 1) % pts.length]!, len = Math.round(Math.hypot(bb.x - aa.x, bb.y - aa.y));
          return { ...k, a: aa, b: bb, length: len === k.length.mm ? k.length : cond(len) };
        }),
      };
    }),
  };
}

/* ——— выравнивание (этап 12, замечание проверки) ——— */

/**
 * «Выровнять такие же по этому»: окна (радиаторы…) той же стены получают ту же высоту от пола
 * и высоту, что у образца. Замеренное не меняется.
 */
export function alignLikeThis(p: Plan, refId: string): Plan {
  const ref = p.wallItems.find(i => i.id === refId);
  if (!ref) return p;
  const set = (d: Dim, mm: Mm): Dim => (d.status === 'measured' ? d : withMm(d, mm));
  return {
    ...p,
    wallItems: p.wallItems.map(i => (i.id !== ref.id && i.wallId === ref.wallId && i.type === ref.type
      ? { ...i, z: set(i.z, ref.z.mm), h: set(i.h, ref.h.mm) } : i)),
  };
}

/** Сколько ещё таких же на этой стене (для подписи кнопки) */
export const likeOnWall = (p: Plan, refId: string): number => {
  const ref = p.wallItems.find(i => i.id === refId);
  return ref ? p.wallItems.filter(i => i.id !== ref.id && i.wallId === ref.wallId && i.type === ref.type).length : 0;
};

/**
 * Привязка по высоте при перетаскивании элемента стены: низ, верх или середина встаёт на уровень
 * низа, верха или середины соседних элементов той же стены, если ближе tol. Возвращает новый z и линию.
 */
export function snapWallZ(p: Plan, id: string, wallId: string, z: Mm, h: Mm, tol: Mm): { z: Mm; line: Mm | null } {
  let best: { z: Mm; line: Mm; d: number } | null = null;
  for (const o of p.wallItems) {
    if (o.id === id || o.wallId !== wallId) continue;
    for (const line of [o.z.mm, o.z.mm + o.h.mm, o.z.mm + o.h.mm / 2]) {
      for (const k of [0, h, h / 2]) {
        const d = Math.abs(z + k - line);
        if (d <= tol && (!best || d < best.d)) best = { z: Math.round(line - k), line: Math.round(line), d };
      }
    }
  }
  return best ? { z: best.z, line: best.line } : { z, line: null };
}

/* ——— развёртки стен: скрыть, отнести в сторону (этап 12, формат 12) ——— */

/** Поменять развёртку стены; пустая (видна, на месте) — поле убирается */
export function setWallElev(p: Plan, wallId: string, o: Partial<WallElev>): Plan {
  return {
    ...p,
    room: {
      ...p.room,
      walls: p.room.walls.map(w => {
        if (w.id !== wallId) return w;
        const e: WallElev = { ...w.elev, ...o };
        const clean: WallElev = { ...(e.hidden ? { hidden: true } : {}), ...(e.dx ? { dx: Math.round(e.dx) } : {}), ...(e.dy ? { dy: Math.round(e.dy) } : {}) };
        const { elev: _, ...rest } = w;
        return Object.keys(clean).length ? { ...rest, elev: clean } : rest;
      }),
    },
  };
}

/** Все развёртки — на свои места (скрытые остаются скрытыми) */
export const resetElevs = (p: Plan): Plan => p.room.walls.reduce((q, w) => setWallElev(q, w.id, { dx: 0, dy: 0 }), p);

/* ——— мебель ровными рядами (этап 12, замечание проверки: «шанс случайно сдвинуть») ——— */

/** Центр и половины габарита предмета на плане; повёрнутый не на 0/90/180/270° — null (с ним не выравниваем) */
function itemBox(it: Item): { cx: Mm; cy: Mm; hx: Mm; hy: Mm } | null {
  const a = ((Math.round(it.angle) % 180) + 180) % 180;
  if (a !== 0 && a !== 90) return null;
  const turned = a === 90;
  return { cx: it.x.mm + it.w.mm / 2, cy: it.y.mm + it.d.mm / 2, hx: (turned ? it.d.mm : it.w.mm) / 2, hy: (turned ? it.w.mm : it.d.mm) / 2 };
}

/**
 * Привязка при перетаскивании предмета: край или середина встаёт на линию края или середины
 * другого предмета, если ближе tol. Возвращает новое место и линии-направляющие (null — нет).
 */
export function snapItemXY(p: Plan, id: string, x: Mm, y: Mm, tol: Mm): { x: Mm; y: Mm; gx: Mm | null; gy: Mm | null } {
  const me = p.items.find(i => i.id === id);
  const b = me && itemBox({ ...me, x: { ...me.x, mm: x }, y: { ...me.y, mm: y } });
  if (!b) return { x, y, gx: null, gy: null };
  let bx: { d: number; line: Mm } | null = null, by: { d: number; line: Mm } | null = null;
  for (const o of p.items) {
    const ob = o.id === id ? null : itemBox(o);
    if (!ob) continue;
    for (const k of [-1, 0, 1]) {
      for (const m of [-1, 0, 1]) {
        const lx = ob.cx + k * ob.hx, dx = lx - (b.cx + m * b.hx);
        if (Math.abs(dx) <= tol && (!bx || Math.abs(dx) < Math.abs(bx.d))) bx = { d: dx, line: lx };
        const ly = ob.cy + k * ob.hy, dy = ly - (b.cy + m * b.hy);
        if (Math.abs(dy) <= tol && (!by || Math.abs(dy) < Math.abs(by.d))) by = { d: dy, line: ly };
      }
    }
  }
  return { x: Math.round(x + (bx?.d ?? 0)), y: Math.round(y + (by?.d ?? 0)), gx: bx && Math.round(bx.line), gy: by && Math.round(by.line) };
}

/** Ряд — по горизонтали плана (одна линия по Y), колонка — по вертикали (одна линия по X) */
export type ItemLine = 'row' | 'col';

/** Предметы того же вида в одном ряду (колонке) с этим: их габариты по Y (по X) перекрываются */
export function itemsInLine(p: Plan, refId: string, line: ItemLine): Item[] {
  const ref = p.items.find(i => i.id === refId);
  const rb = ref && itemBox(ref);
  if (!ref || !rb) return [];
  return p.items.filter(o => {
    const ob = o.id === ref.id || o.type !== ref.type ? null : itemBox(o);
    if (!ob) return false;
    return line === 'row' ? Math.abs(ob.cy - rb.cy) < ob.hy + rb.hy : Math.abs(ob.cx - rb.cx) < ob.hx + rb.hx;
  });
}

/** «Выровнять ряд (колонку) по этому»: середины на одной линии с этим; замеренное не трогаем */
export function alignItemsLine(p: Plan, refId: string, line: ItemLine): Plan {
  const ref = p.items.find(i => i.id === refId);
  const rb = ref && itemBox(ref);
  if (!rb) return p;
  const ids = new Set(itemsInLine(p, refId, line).map(i => i.id));
  const set = (d: Dim, mm: Mm): Dim => (d.status === 'measured' ? d : withMm(d, Math.round(mm)));
  return {
    ...p,
    items: p.items.map(o => (!ids.has(o.id) ? o
      : line === 'row' ? { ...o, y: set(o.y, rb.cy - o.d.mm / 2) } : { ...o, x: set(o.x, rb.cx - o.w.mm / 2) })),
  };
}
