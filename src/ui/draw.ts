// Своя комната (этап 12): рисование щелчками по углам, заготовка, «нарисовать заново».
import { signal } from '@preact/signals';
import type { Point } from '../model/types';
import * as A from '../model/actions';
import { closes, snapCorner } from '../geometry/draw';
import { rectPts, unionOrtho } from '../geometry/union';
import { roomCorners } from '../model/room';
import { dispatch, gridStep, plan, sel, toast } from './store';
import { uid } from '../model/state';

/** идёт рисование: углы, отмеченные по порядку */
export const drawing = signal<{ pts: Point[] } | null>(null);
/** где сейчас курсор (мм пола) — для линии-подсказки к следующему углу */
export const drawHover = signal<Point | null>(null);

export function startDraw(): void {
  shaping.value = null;
  sel.value = null;
  drawHover.value = null;
  drawing.value = { pts: [] };
  // на телефоне подсказка — в полоске над планом; «щёлкайте» — только для мыши
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) toast('Щёлкайте по углам комнаты по порядку. Замкнуть — щелчок по первому углу');
}

export function cancelDraw(): void {
  drawing.value = null;
  drawHover.value = null;
}

/** шаг привязки: как у сетки, но не мельче 1 см */
const step = () => Math.max(10, gridStep.value);

/** Угол с привязкой; tol — «прилипание» к первому углу, мм пола */
export function cornerAt(raw: Point, free: boolean, tol: number): Point {
  return snapCorner(drawing.value?.pts ?? [], raw, { step: free ? 10 : step(), free, tol });
}

export function addCorner(raw: Point, free: boolean, tol: number): void {
  const d = drawing.value;
  if (!d) return;
  const p = cornerAt(raw, free, tol);
  const last = d.pts[d.pts.length - 1];
  if (last && last.x === p.x && last.y === p.y) return;
  if (closes(d.pts, p)) { finishDraw(); return; }
  drawing.value = { pts: [...d.pts, p] };
}

export function undoCorner(): void {
  const d = drawing.value;
  if (d?.pts.length) drawing.value = { pts: d.pts.slice(0, -1) };
}

/** Замкнуть комнату: последний угол соединяется с первым */
export function finishDraw(): void {
  const d = drawing.value;
  if (!d || d.pts.length < 3) { toast('Нужно хотя бы три угла'); return; }
  const before = plan.value;
  dispatch(p => A.drawRoom(p, d.pts));
  if (plan.value === before) { toast('Углы лежат на одной прямой — нарисуйте ещё раз'); return; }
  cancelDraw();
  toast('Комната готова. Длины стен — «условно»: впишите замеры в поля «Стена А, м» и дальше или нажмите на подпись стены на плане');
}

/** Заготовка: прямоугольная комната, дальше — как раньше */
export function takeTemplate(): void {
  cancelDraw();
  dispatch(A.rectTemplate);
  toast('Заготовка: прямоугольник 10 × 6 м. Впишите длину L и ширину W');
}

/** Убрать комнату и нарисовать заново (окна, двери и метки на стенах уйдут) */
export function redrawRoom(): void {
  const p = plan.value;
  const onWalls = p.wallItems.length + p.markers.filter(m => m.place !== 'floor').length;
  if (!confirm(onWalls ? `Убрать комнату? Окна, двери и метки на стенах (${onWalls}) тоже уберутся. Отменить можно кнопкой ↶.` : 'Убрать комнату и нарисовать заново? Отменить можно кнопкой ↶.')) return;
  dispatch(A.clearRoom);
  startDraw();
}

/* ——— фигуры: прямоугольник, слитый с комнатой ——— */

/** идёт рисование прямоугольника: первый угол (мм пола), если уже нажат; annex — соседнее помещение, иначе — расширить комнату */
export const shaping = signal<{ a?: Point; b?: Point; annex?: boolean } | null>(null);

export function startShape(annex = false): void {
  cancelDraw();
  sel.value = null;
  shaping.value = { annex };
  toast(!plan.value.room.walls.length ? 'Протяните прямоугольник от угла до угла'
    : annex ? 'Протяните соседнее помещение вплотную к комнате — между ними будет стена-перегородка'
      : 'Протяните прямоугольник так, чтобы он касался комнаты — он сольётся с ней');
}

export const cancelShape = (): void => { shaping.value = null; };

const WHY = {
  apart: 'Прямоугольник должен касаться комнаты стороной',
  hole: 'Получилась комната с дырой или касание углом — так нельзя',
  overlap: 'Соседнее помещение заходит внутрь комнаты — протяните его вплотную снаружи',
  slanted: 'У комнаты есть косые стены — нажмите «Выровнять стены» и пристройте ещё раз',
} as const;

/** Прямоугольник по двум углам: новая комната или пристройка к нарисованной */
export function applyShape(a: Point, b: Point, annex = false): void {
  shaping.value = null;
  if (Math.abs(a.x - b.x) < 300 || Math.abs(a.y - b.y) < 300) { toast('Прямоугольник меньше 30 см — протяните ещё раз'); shaping.value = { annex }; return; }
  const p = plan.value, r = rectPts(a, b);
  if (annex && p.room.walls.length) {
    const res = A.addAnnex(p, 'a' + uid(), r);
    if (!res.ok) { toast(WHY[res.why]); return; }
    dispatch(() => res.plan);
    toast('Соседнее помещение готово. Название и длины стен — на вкладке «Помещение»; развёртки у него нет');
    return;
  }
  if (!p.room.walls.length) { dispatch(q => A.drawRoom(q, r)); toast('Комната готова. Можно пристроить ещё прямоугольник или вписать длины стен'); return; }
  const u = unionOrtho([roomCorners(p.room), r]);
  if (!u.ok) { toast(WHY[u.why]); return; }
  const lost = p.wallItems.length + p.markers.filter(m => m.place !== 'floor').length;
  if (lost && !confirm(`Стены комнаты перестроятся: окна, двери и метки на стенах (${lost}) уберутся. Продолжить? Отменить можно кнопкой ↶.`)) return;
  dispatch(q => A.drawRoom(q, u.pts));
  toast('Прямоугольник слит с комнатой. Буквы стен назначены заново');
}

/** угол прямоугольника — по сетке */
export const shapeCorner = (raw: Point): Point => { const st = Math.max(10, gridStep.value); return { x: Math.round(raw.x / st) * st, y: Math.round(raw.y / st) * st }; };

/** «Выровнять стены»: косые — по горизонтали и вертикали; сливаются — окна и двери на них уберутся */
export function straighten(): void {
  const p = plan.value, q = A.straightenRoom(p);
  if (!q) { toast('Выровнять нельзя: нужно хотя бы четыре стены, примерно по горизонтали и вертикали'); return; }
  const lost = p.wallItems.length - q.wallItems.length + p.markers.length - q.markers.length;
  if (lost > 0 && !confirm(`Несколько стен сольются в одну: окна, двери и метки на них (${lost}) уберутся. Продолжить? Отменить можно кнопкой ↶.`)) return;
  dispatch(() => q);
  toast('Стены выровнены по прямым углам. Изменившиеся длины — «условно»');
}

/** Угол, который тянут, прилипает к линиям соседних углов — косые стены не получатся случайно */
export function cornerSnap(i: number, pt: Point, tol: number): Point {
  const ws = plan.value.room.walls, n = ws.length;
  if (!n) return pt;
  const prev = ws[(i - 1 + n) % n]!.a, next = ws[(i + 1) % n]!.a;
  let { x, y } = pt;
  for (const q of [prev, next]) {
    if (Math.abs(x - q.x) <= tol) x = q.x;
    if (Math.abs(y - q.y) <= tol) y = q.y;
  }
  return { x, y };
}
