// Снимки на развёртке стен (этап 9): какой участок стены занимает кадр, рамка объекта
// на снимке, масштаб по отрезку известной длины.
import type { Mm, PhotoBox, PhotoPt, Plan, WallPhoto } from './types';
import { applyH, homography } from '../geometry/homography';
import { findWall, rectSize, wallLength } from './room';
import { patch, setRoomSize } from './actions';
import { cond } from './units';

const UNIT = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/** Участок стены под кадром, мм от левого угла; null — края перепутаны или стены нет */
export function frameSpan(p: Plan, wp: WallPhoto): { from: Mm; to: Mm } | null {
  const w = findWall(p.room, wp.wallId);
  if (!w) return null;
  const from = wp.left.kind === 'corner' ? 0 : wp.left.off.mm;
  const to = wp.right.kind === 'corner' ? wallLength(w) : wp.right.off.mm;
  return to > from ? { from, to } : null;
}

/** Соотношение сторон кадра: ширина участка стены / высота помещения */
export function frameAspect(p: Plan, wp: WallPhoto): number | null {
  const s = frameSpan(p, wp), h = p.room.height.mm;
  return s && h > 0 ? (s.to - s.from) / h : null;
}

/** Кадр, который показан на стене в этом месте (последний добавленный — сверху) */
export function frameAt(p: Plan, wallId: string, off: Mm): WallPhoto | undefined {
  return [...p.wallPhotos].reverse().find(wp => {
    if (wp.wallId !== wallId || !wp.show || !p.photos.some(ph => ph.id === wp.photoId)) return false;
    const s = frameSpan(p, wp);
    return !!s && off >= s.from && off <= s.to;
  });
}

/**
 * Рамка на снимке для участка стены (обведённое окно и т. п.): углы участка переводятся
 * на снимок, берётся охватывающий прямоугольник в долях снимка.
 */
export function photoBoxOf(p: Plan, wp: WallPhoto, r: { off: Mm; z: Mm; w: Mm; h: Mm }): PhotoBox | null {
  const s = frameSpan(p, wp), H = p.room.height.mm;
  const m = homography(UNIT, wp.quad);
  if (!s || !m || H <= 0) return null;
  const u = (off: Mm) => (off - s.from) / (s.to - s.from), v = (z: Mm) => (H - z) / H;
  const pts = [[r.off, r.z], [r.off + r.w, r.z], [r.off + r.w, r.z + r.h], [r.off, r.z + r.h]].map(([o, z]) => applyH(m, u(o!), v(z!)));
  const cl = (t: number) => Math.max(0, Math.min(1, t));
  const x0 = cl(Math.min(...pts.map(q => q.x))), x1 = cl(Math.max(...pts.map(q => q.x)));
  const y0 = cl(Math.min(...pts.map(q => q.y))), y1 = cl(Math.max(...pts.map(q => q.y)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Что поправить по масштабу снимка */
export type ScaleFix =
  /** высота помещения */
  | { what: 'height'; mm: Mm }
  /** длина стены (для А и Б — L, для В и Г — W) */
  | { what: 'wall'; mm: Mm }
  /** ориентир левого или правого края кадра */
  | { what: 'left' | 'right'; mm: Mm };

export interface ScaleResult {
  /** отрезок по горизонтали (вдоль стены) или по вертикали */
  dir: 'h' | 'v';
  /** во сколько раз размеры кадра больше, чем сейчас на плане */
  k: number;
  fix: ScaleFix;
  /** замерено — поправить нельзя, только показать */
  locked: boolean;
}

/**
 * Масштаб по фото: a, b — концы отрезка известной длины на выпрямленном кадре (доли его ширины и высоты),
 * known — настоящая длина, мм. Направление — по большей составляющей.
 */
export function photoScale(p: Plan, wp: WallPhoto, a: PhotoPt, b: PhotoPt, known: Mm): ScaleResult | null {
  const s = frameSpan(p, wp), H = p.room.height.mm, wall = findWall(p.room, wp.wallId);
  if (!s || !wall || H <= 0 || known <= 0) return null;
  const span = s.to - s.from;
  const dx = Math.abs(b.x - a.x) * span, dz = Math.abs(b.y - a.y) * H;
  if (Math.max(dx, dz) < 1) return null;
  if (dz > dx) {
    const k = known / dz;
    return { dir: 'v', k, fix: { what: 'height', mm: Math.round(H * k) }, locked: p.room.height.status === 'measured' };
  }
  const k = known / dx, real = Math.round(span * k), len = wallLength(wall);
  const { L, W } = rectSize(p.room);
  const wallDim = wp.wallId === 'A' || wp.wallId === 'B' ? L : W;
  if (wp.left.kind === 'corner' && wp.right.kind === 'corner') return { dir: 'h', k, fix: { what: 'wall', mm: real }, locked: wallDim.status === 'measured' };
  if (wp.right.kind === 'mark') return { dir: 'h', k, fix: { what: 'right', mm: s.from + real }, locked: wp.right.off.status === 'measured' };
  const left = wp.left as Extract<WallPhoto['left'], { kind: 'mark' }>;
  return { dir: 'h', k, fix: { what: 'left', mm: len - real }, locked: left.off.status === 'measured' };
}

/** Применить масштаб по фото: размеры получают статус «условно» */
export function applyScaleFix(p: Plan, wpId: string, fix: ScaleFix): Plan {
  const wp = p.wallPhotos.find(w => w.id === wpId);
  if (!wp) return p;
  if (fix.what === 'height') return setRoomSize(p, { h: fix.mm });
  if (fix.what === 'wall') return setRoomSize(p, wp.wallId === 'A' || wp.wallId === 'B' ? { L: fix.mm } : { W: fix.mm });
  return patch(p, 'wallPhotos', wpId, { [fix.what]: { kind: 'mark', off: cond(fix.mm) } });
}

/**
 * Рамка на выпрямленном кадре (доли: x — слева направо по участку, y — от потолка вниз) →
 * участок стены, мм, с точностью до сантиметра (этап 10, находки модели).
 */
export function wallRectOfFrame(p: Plan, wp: WallPhoto, b: { x0: number; y0: number; x1: number; y1: number }): { off: Mm; z: Mm; w: Mm; h: Mm } | null {
  const s = frameSpan(p, wp), H = p.room.height.mm;
  if (!s || H <= 0) return null;
  const cm = (mm: number) => Math.round(mm / 10) * 10, span = s.to - s.from;
  const off = cm(s.from + b.x0 * span), right = cm(s.from + b.x1 * span);
  const z = cm(H * (1 - b.y1)), top = cm(H * (1 - b.y0));
  return { off, z, w: right - off, h: top - z };
}
