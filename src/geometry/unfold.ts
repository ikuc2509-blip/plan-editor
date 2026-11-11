// Геометрия развёртки по списку стен-отрезков: пол в центре, каждая стена
// «откинута» наружу от своего отрезка. Координаты листа — в мм листа (A3 420×297),
// размеры помещения здесь — в метрах (из миллиметров модели).
import type { Ceiling, Room, SheetOptions, Wall } from '../model/types';
import { roomExtent } from '../model/room';
import { toM } from '../model/units';

export type Pt = [number, number];

/** Стена для рисования: отрезок в метрах, направление и нормаль внутрь */
export interface Seg {
  wall: Wall;
  ax: number;
  ay: number;
  len: number;
  /** единичный вектор от начала к концу */
  ux: number;
  uy: number;
  /** единичная нормаль внутрь помещения (справа от направления) */
  nx: number;
  ny: number;
  /** с какой стороны пола лежит развёртка этой стены на листе */
  side: 'top' | 'right' | 'bottom' | 'left';
  /** развёртка отнесена в сторону, м (wall.elev, этап 12) */
  shx: number;
  shy: number;
  /** полоска «что за стеной» между стеной и развёрткой, м (формат 15); 0 — нет */
  band: number;
}

export interface Geom {
  /** габарит пола, м */
  L: number;
  W: number;
  h: number;
  /** мм листа на 1 м */
  s: number;
  /** толщина стен на листе, мм: развёртка откидывается от наружной грани стены (как в образце) */
  t: number;
  /** точка начала координат пола на листе */
  fx: number;
  fy: number;
  /** помещается ли развёртка в область чертежа */
  fits: boolean;
  segs: Seg[];
  /** стены соседних помещений — только на плане пола, без развёрток (этап 12) */
  annexSegs: Seg[][];
  /** стены-перегородки основного помещения: к ним примыкает соседнее — развёртка легла бы на его пол */
  noUnfold: ReadonlySet<string>;
  /** развёртка потолка (формат 15); null — не показана */
  ceil: CeilAt | null;
}

/** Где потолок: за развёрткой стены sg; сдвиг — развёртки этой стены и свой, м */
export interface CeilAt {
  sg: Seg;
  shx: number;
  shy: number;
}

/** Прямоугольник на листе, мм */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Масштабы режима «В масштабе», от крупного к мелкому */
export const SCALES = [50, 100, 200] as const;

const PAD = 15;

/** Толщина стен на плане, м — одна на помещение, только для вида (decisions.md, этап 12) */
export const WALL_T = 0.25;

/** Ширина полоски «что за стеной» на листе, мм — при любом масштабе, чтобы подпись читалась */
export const BAND_MM = 6;

function sideOf(nx: number, ny: number): Seg['side'] {
  // развёртка лежит снаружи, т. е. против нормали внутрь
  if (Math.abs(ny) >= Math.abs(nx)) return ny > 0 ? 'top' : 'bottom';
  return nx < 0 ? 'right' : 'left';
}

export function toSeg(w: Wall): Seg {
  const ax = toM(w.a.x), ay = toM(w.a.y);
  const dx = toM(w.b.x) - ax, dy = toM(w.b.y) - ay;
  const len = Math.hypot(dx, dy);
  const ux = len ? dx / len : 1, uy = len ? dy / len : 0;
  // поворот на 90° «вправо» при оси Y вниз
  const nx = -uy, ny = ux;
  return { wall: w, ax, ay, len, ux, uy, nx, ny, side: sideOf(nx, ny), shx: toM(w.elev?.dx ?? 0), shy: toM(w.elev?.dy ?? 0), band: 0 };
}

/**
 * Стены основного помещения с полосками «что за стеной»: band м у стен, где вписано, что за ними;
 * у перегородки к соседнему помещению полоски нет — там его название
 */
function roomSegs(room: Room, annexes: Annexes, band: number): Seg[] {
  const segs = room.walls.map(toSeg), annexSegs = annexes.map(a => a.walls.map(toSeg));
  return segs.map(sg => (sg.wall.behind?.trim() && !annexSegs.some(a => a.some(o => touches(sg, o))) ? { ...sg, band } : sg));
}

/** Стены соседних помещений (у них свои стены, высота — общая) */
type Annexes = readonly { walls: Wall[] }[];

/** Стены основного помещения без развёртки: скрытые и перегородки к соседним помещениям */
function hiddenWalls(segs: readonly Seg[], annexSegs: readonly Seg[][]): Set<string> {
  return new Set(segs.filter(sg => sg.wall.elev?.hidden || annexSegs.some(a => a.some(o => touches(sg, o)))).map(sg => sg.wall.id));
}

/** Габарит развёртки, м: пол со стенами, развёртки (там, где они на листе), соседние помещения, потолок */
function unfoldedSize(room: Room, annexes: Annexes = [], ceil: CeilAt | null = null, band = 0) {
  const e = roomExtent(room);
  const h = toM(room.height.mm);
  const segs = roomSegs(room, annexes, band), hidden = hiddenWalls(segs, annexes.map(a => a.walls.map(toSeg)));
  let minX = toM(e.minX) - WALL_T, maxX = toM(e.maxX) + WALL_T, minY = toM(e.minY) - WALL_T, maxY = toM(e.maxY) + WALL_T;
  for (const sg of segs) {
    // полоска «что за стеной» — у стены, и когда развёртки нет
    const strip = WALL_T + sg.band;
    for (const [t, k] of [[0, strip], [sg.len, strip]] as const) {
      const x = sg.ax + sg.ux * t - sg.nx * k, y = sg.ay + sg.uy * t - sg.ny * k;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (hidden.has(sg.wall.id)) continue;
    // четыре угла развёртки: у стены и на высоте стены снаружи, со сдвигом
    const o = h + strip;
    for (const [t, k] of [[0, strip], [sg.len, strip], [0, o], [sg.len, o]] as const) {
      const x = sg.ax + sg.ux * t - sg.nx * k + sg.shx, y = sg.ay + sg.uy * t - sg.ny * k + sg.shy;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (ceil) {
    for (const sg of segs) {
      const [x, y] = ceilM(ceil, h, sg.ax, sg.ay);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  for (const a of annexes) {
    for (const w of a.walls) {
      minX = Math.min(minX, toM(w.a.x)); maxX = Math.max(maxX, toM(w.a.x));
      minY = Math.min(minY, toM(w.a.y)); maxY = Math.max(maxY, toM(w.a.y));
    }
  }
  return { e, h, minX, minY, totW: maxX - minX, totH: maxY - minY };
}

/**
 * Точка потолка над точкой пола (x, y), м → место на листе в координатах пола, м.
 * Потолок откинут за верхний край развёртки стены: зеркально полу относительно линии стены
 * и дальше на высоту стены (и её толщину — развёртка откидывается от наружной грани).
 */
function ceilM(c: CeilAt, h: number, x: number, y: number): Pt {
  const sg = c.sg, d = (x - sg.ax) * sg.nx + (y - sg.ay) * sg.ny, k = 2 * d + h + WALL_T + sg.band;
  return [x - sg.nx * k + c.shx, y - sg.ny * k + c.shy];
}

/** Стена, за развёрткой которой лежит потолок: выбранная, а если её нет или развёртка скрыта — где больше места */
function ceilOf(room: Room, area: Area, annexes: Annexes, c: Ceiling | undefined, band = 0): CeilAt | null {
  if (!c?.show || !room.walls.length) return null;
  const segs = roomSegs(room, annexes, band), hidden = hiddenWalls(segs, annexes.map(a => a.walls.map(toSeg)));
  const at = (sg: Seg): CeilAt => ({ sg, shx: sg.shx + toM(c.dx ?? 0), shy: sg.shy + toM(c.dy ?? 0) });
  const ok = segs.filter(sg => !hidden.has(sg.wall.id));
  const own = ok.find(sg => sg.wall.id === c.wallId);
  if (own) return at(own);
  // где больше места: при каком положении весь план на листе выходит крупнее
  let best: CeilAt | null = null, bestK = -1;
  for (const sg of ok) {
    const { totW, totH } = unfoldedSize(room, annexes, at(sg), band), k = Math.min(area.w / totW, area.h / totH);
    if (k > bestK + 1e-9) { best = at(sg); bestK = k; }
  }
  return best;
}

/** Помещается ли развёртка в область листа в масштабе 1:scale */
export function fitsAt(room: Room, area: Area, scale: number, annexes: Annexes = [], ceiling?: Ceiling): boolean {
  const s = 1000 / scale, band = BAND_MM / s;
  const { totW, totH } = unfoldedSize(room, annexes, ceilOf(room, area, annexes, ceiling, band), band);
  return totW * s <= area.w - 2 * PAD + 0.01 && totH * s <= area.h - 2 * PAD + 0.01;
}

/** Ближайший более мелкий масштаб, в котором план помещается; null — не помещается ни в каком */
export function smallerScaleThatFits(room: Room, area: Area, scale: number, annexes: Annexes = [], ceiling?: Ceiling): number | null {
  return SCALES.find(k => k > scale && fitsAt(room, area, k, annexes, ceiling)) ?? null;
}

export function geom(room: Room, sheet: SheetOptions, area: Area, annexes: Annexes = [], ceiling?: Ceiling): Geom {
  const annexSegs = annexes.map(a => a.walls.map(toSeg));
  if (!room.walls.length) {
    // чистый лист (этап 12): масштаб для рисования — 1:100 (или масштаб листа), начало координат — середина чертежа
    const k = 1000 / (sheet.mode === 'scale' ? sheet.scale : 100);
    return { L: 0, W: 0, h: toM(room.height.mm), s: k, t: WALL_T * k, fx: area.x + area.w / 2, fy: area.y + area.h / 2, fits: true, segs: [], annexSegs, noUnfold: new Set(), ceil: null };
  }
  const pad = PAD;
  // полоска «что за стеной» — BAND_MM на листе: в масштабе ширина в метрах известна сразу,
  // в схеме — по масштабу без полосок (с ними лист чуть мельче, полоска выходит чуть уже)
  const fitS = (band: number) => {
    const { totW, totH } = unfoldedSize(room, annexes, ceilOf(room, area, annexes, ceiling, band), band);
    return Math.min((area.w - 2 * pad) / totW, (area.h - 2 * pad) / totH);
  };
  const band = BAND_MM / (sheet.mode === 'scale' ? 1000 / sheet.scale : fitS(0));
  const segs = roomSegs(room, annexes, band);
  const ceil = ceilOf(room, area, annexes, ceiling, band);
  const { e, h, minX, minY, totW, totH } = unfoldedSize(room, annexes, ceil, band);
  const s = sheet.mode === 'scale' ? 1000 / sheet.scale : Math.min((area.w - 2 * pad) / totW, (area.h - 2 * pad) / totH);
  const fits = totW * s <= area.w - 2 * pad + 0.01 && totH * s <= area.h - 2 * pad + 0.01;
  const fx = area.x + (area.w - totW * s) / 2 - minX * s, fy = area.y + (area.h - totH * s) / 2 - minY * s;
  const noUnfold = hiddenWalls(segs, annexSegs);
  // стена потолка — та же, что в segs
  const ceilAt = ceil ? { ...ceil, sg: segs.find(sg => sg.wall.id === ceil.sg.wall.id)! } : null;
  return { L: toM(e.maxX - e.minX), W: toM(e.maxY - e.minY), h, s, t: WALL_T * s, fx, fy, fits, segs, annexSegs, noUnfold, ceil: ceilAt };
}

/** Стена основного помещения с развёрткой; у перегородки к соседнему помещению развёртки нет */
export function segOf(g: Geom, wallId: string): Seg | undefined {
  return g.noUnfold.has(wallId) ? undefined : g.segs.find(sg => sg.wall.id === wallId);
}

/** Две стены на одной линии и перекрываются по длине — общая стена-перегородка */
function touches(a: Seg, b: Seg): boolean {
  const cross = (x: number, y: number) => a.ux * (y - a.ay) - a.uy * (x - a.ax);
  const bx = b.ax + b.ux * b.len, by = b.ay + b.uy * b.len;
  if (Math.abs(cross(b.ax, b.ay)) > 1e-3 || Math.abs(cross(bx, by)) > 1e-3) return false;
  const t1 = (b.ax - a.ax) * a.ux + (b.ay - a.ay) * a.uy, t2 = (bx - a.ax) * a.ux + (by - a.ay) * a.uy;
  return Math.min(a.len, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)) > 1e-3;
}

/** Стена на плане пола: основного помещения или соседнего (окна и двери рисуются и там) */
export function planSegOf(g: Geom, wallId: string): Seg | undefined {
  return [...g.segs, ...g.annexSegs.flat()].find(sg => sg.wall.id === wallId);
}

/** Точка пола (м) → лист */
export const floorPt = (g: Geom, x: number, y: number): Pt => [g.fx + x * g.s, g.fy + y * g.s];

/** Точка потолка над точкой пола (м) → лист; потолка на листе нет — null */
export function ceilPt(g: Geom, x: number, y: number): Pt | null {
  if (!g.ceil) return null;
  const [cx, cy] = ceilM(g.ceil, g.h, x, y);
  return floorPt(g, cx, cy);
}

/** Точка листа на развёртке потолка → точка пола под ней, м */
export function ceilToFloor(g: Geom, px: number, py: number): Pt | null {
  const c = g.ceil;
  if (!c) return null;
  const sg = c.sg, qx = (px - g.fx) / g.s - c.shx, qy = (py - g.fy) / g.s - c.shy;
  // ceilM наоборот: расстояние от стены вглубь пола d по расстоянию наружу на потолке
  const d = -((qx - sg.ax) * sg.nx + (qy - sg.ay) * sg.ny) - g.h - WALL_T - sg.band, k = 2 * d + g.h + WALL_T + sg.band;
  return [qx + sg.nx * k, qy + sg.ny * k];
}

/** Сдвиг мыши по потолку (мм листа) → сдвиг по полу (мм листа): потолок зеркален полу */
export function ceilDelta(g: Geom, dx: number, dy: number): Pt {
  if (!g.ceil) return [dx, dy];
  const { nx, ny } = g.ceil.sg, k = 2 * (dx * nx + dy * ny);
  return [dx - nx * k, dy - ny * k];
}

/** Контур потолка на листе (путь SVG); потолка нет — пусто */
export function ceilPath(g: Geom): string {
  if (!g.ceil) return '';
  return g.segs.map((sg, i) => { const [x, y] = ceilPt(g, sg.ax, sg.ay)!; return `${i ? 'L' : 'M'}${+x.toFixed(3)} ${+y.toFixed(3)}`; }).join(' ') + ' Z';
}

/** Точка на линии стены в плане пола, t — от начала стены, м */
export function wallPt(g: Geom, sg: Seg, t: number): Pt {
  return floorPt(g, sg.ax + sg.ux * t, sg.ay + sg.uy * t);
}

export const inward = (sg: Seg): Pt => [sg.nx, sg.ny];
export const outward = (sg: Seg): Pt => [-sg.nx, -sg.ny];

/** Точка на развёртке стены: off — вдоль стены от её начала, z — от пола, м; пол развёртки — у наружной грани стены */
export function unf(g: Geom, sg: Seg, off: number, z: number): Pt {
  const p = wallPt(g, sg, off), d = z * g.s + g.t + sg.band * g.s;
  return [p[0] - sg.nx * d + sg.shx * g.s, p[1] - sg.ny * d + sg.shy * g.s];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function unfRect(g: Geom, sg: Seg, off: number, z: number, len: number, eh: number): Rect {
  const a = unf(g, sg, off, z), b = unf(g, sg, off + len, z + eh);
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

/** Сдвиг мыши на листе (мм листа) → сдвиг вдоль стены и вверх по стене (м) */
export function wallDelta(sg: Seg, dx: number, dy: number, s: number): Pt {
  return [(dx * sg.ux + dy * sg.uy) / s, -(dx * sg.nx + dy * sg.ny) / s];
}

/** Место на плане, куда коснулись: пол (мм от начала координат) или развёртка стены */
export type Spot =
  | { place: 'floor' | 'ceiling'; x: number; y: number }
  | { place: 'wall'; wallId: string; off: number; z: number };

/** Точка внутри многоугольника пола (лучом вправо) */
function inFloor(segs: Seg[], x: number, y: number): boolean {
  let inside = false;
  for (const sg of segs) {
    const x1 = sg.ax, y1 = sg.ay, x2 = sg.ax + sg.ux * sg.len, y2 = sg.ay + sg.uy * sg.len;
    if ((y1 > y) !== (y2 > y) && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
  }
  return inside;
}

/**
 * Точка листа (мм листа) → место на плане: «новая метка — касанием плана» (этап 8).
 * Вне пола и вне развёрток (стен и потолка) — null.
 */
export function locate(g: Geom, px: number, py: number): Spot | null {
  const x = (px - g.fx) / g.s, y = (py - g.fy) / g.s;
  const mm = (m: number) => Math.round(m * 1000);
  if (inFloor(g.segs, x, y) || g.annexSegs.some(a => inFloor(a, x, y))) return { place: 'floor', x: mm(x), y: mm(y) };
  for (const sg of g.segs) {
    if (g.noUnfold.has(sg.wall.id)) continue;
    const o = unf(g, sg, 0, 0);
    const [off, z] = wallDelta(sg, px - o[0], py - o[1], g.s);
    if (off >= 0 && off <= sg.len && z >= 0 && z <= g.h) return { place: 'wall', wallId: sg.wall.id, off: mm(off), z: mm(z) };
  }
  const c = ceilToFloor(g, px, py);
  if (c && inFloor(g.segs, c[0], c[1])) return { place: 'ceiling', x: mm(c[0]), y: mm(c[1]) };
  return null;
}

/** Поворот подписи на развёртке, чтобы текст читался (не вверх ногами) */
export function textRot(sg: Seg): number {
  return sg.side === 'left' ? -90 : sg.side === 'right' ? 90 : 0;
}

/** Какие развёртки налезают друг на друга или на пол: пары букв стен (подсказка «отнесите в сторону», этап 12) */
export function elevOverlaps(g: Geom): [string, string][] {
  const rs = g.segs.filter(sg => !g.noUnfold.has(sg.wall.id)).map(sg => ({ sg, r: unfRect(g, sg, 0, 0, sg.len, g.h) }));
  const hit = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.3 && b.x < a.x + a.w - 0.3 && a.y < b.y + b.h - 0.3 && b.y < a.y + a.h - 0.3;
  const out: [string, string][] = [];
  rs.forEach((a, i) => rs.slice(i + 1).forEach(b => { if (hit(a.r, b.r)) out.push([a.sg.wall.letter, b.sg.wall.letter]); }));
  // потолок — габаритом контура; со своей развёрткой он только соприкасается
  const cr = ceilRect(g);
  if (cr) rs.forEach(a => { if (hit(a.r, cr)) out.push([a.sg.wall.letter, 'потолок']); });
  return out;
}

/** Габарит развёртки потолка на листе; потолка нет — null */
export function ceilRect(g: Geom): Rect | null {
  if (!g.ceil) return null;
  const ps = g.segs.map(sg => ceilPt(g, sg.ax, sg.ay)!), xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
