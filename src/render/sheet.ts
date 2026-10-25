// План → SVG листа A3 или A4. Один и тот же код рисует лист на экране, в SVG, PNG и PDF.
import type { Callout, Dim, Marker, Mm, Plan, Selection, WallPhoto } from '../model/types';
import { frameSpan } from '../model/wallPhotos';
import { IT_TYPES, WI_TYPES } from '../model/labels';
import { annexName, isRect, noRoom, rectSizeOf, wallsByLetter } from '../model/room';
import { tieOf } from '../model/measure';
import { toM } from '../model/units';
import { floorPt, geom, inward, outward, planSegOf, segOf, textRot, unf, unfRect, wallPt, type Geom, type Seg } from '../geometry/unfold';
import { gridLineStep } from '../geometry/rotate';
import { measureNote } from '../model/measure';
import { layoutFor, type Layout } from './layout';
import { LEGEND_BOX, SYMBOL_TYPES, itemSymbol } from './symbols';
import { Ln, R, T, esc, fmt, marker, wrap } from './svg';

export interface DrawOpts {
  /** выделенный объект; для файлов не передаётся — рамки выделения не рисуются */
  sel?: Selection | null;
  /** шаг привязки, мм: сетка рисуется только на экране */
  grid?: Mm;
  /** выпрямленные снимки стен: id кадра → адрес картинки; только на экране */
  wallImages?: Readonly<Record<string, string>>;
  /** лист на экране телефона: вокруг меток невидимая зона под палец (в файлы не попадает) */
  touch?: boolean;
  /** лист на экране: размеры можно щёлкнуть, чтобы ввести замер */
  screen?: boolean;
}

const SEL = 'stroke="#2F6FB3" stroke-width="0.7" fill="none"';
/** цвет незамеренного в масштабном режиме (decisions.md) */
export const GRAY = '#9A9A9A';
const isVert = (sg: Seg) => sg.side === 'left' || sg.side === 'right';

const measured = (...ds: Dim[]): boolean => ds.every(d => d.status === 'measured');
/** перекрасить линии объекта в серый */
const gray = (svg: string): string => svg.replace(/#111\b/g, GRAY);

export const sheetLayout = (st: Plan): Layout => layoutFor(st.sheet.paper);
export const sheetGeom = (st: Plan): Geom => geom(st.room, st.sheet, sheetLayout(st).area, st.annexes);

/** Метка, положение которой не замерено */
function markerApprox(m: Marker): boolean {
  if (m.place === 'floor') return !measured(m.x, m.y);
  if (m.place === 'wall') return !measured(m.off, m.z);
  return !measured(m.off);
}

/** Содержимое листа (без корневого тега svg) */
export function drawSheet(st: Plan, opts: DrawOpts = {}): string {
  const lay = sheetLayout(st), fr = lay.frame, right = fr.x + fr.w, bottom = fr.y + fr.h;
  const g = sheetGeom(st), P: string[] = [];
  const { fx, fy, s, L, W, h } = g;
  const sc = st.sheet.mode === 'scale';
  const sel = opts.sel ?? null;
  const selA = (kind: Selection['kind'], id: string) => !!sel && sel.kind === kind && sel.id === id;
  // у нарисованной комнаты (этап 12) нет L и W — у неё длины стен
  const size = rectSizeOf(st.room);
  const rect = isRect(st.room);
  // контур пола: многоугольник по стенам
  const floorD = floorPath(g);
  let anyGray = false, anyBlank = false;
  /** в масштабе незамеренное — серым */
  const tint = (svg: string, approx: boolean) => { if (sc && approx) { anyGray = true; return gray(svg); } return svg; };
  /** на экране размер можно щёлкнуть — откроется окно замера; в файлах атрибутов нет */
  const clickable = (svg: string, ref: string) => (opts.screen ? `<g data-measure="${ref}" style="cursor:pointer">${svg}</g>` : svg);

  P.push(R(0, 0, lay.w, lay.h, 'fill="#fff"'));
  P.push(R(fr.x, fr.y, fr.w, fr.h, 'fill="none" stroke="#111" stroke-width="0.5"'));
  P.push(Ln(fr.x, 24, right, 24, 'stroke="#111" stroke-width="0.3"'));
  P.push(Ln(lay.colX, 24, lay.colX, bottom, 'stroke="#111" stroke-width="0.3"'));
  // заголовок — слева, как в образце
  P.push(T(fr.x + 4, 13, 'Развёрнутый план помещения (план-схема с развёрткой стен)', { size: 4.4, weight: 700 }));
  const sub = [st.stamp.object, st.stamp.protocol].filter(Boolean).join(' — ');
  if (sub) P.push(T(fr.x + 4, 19.6, sub, { size: 2.9 }));

  /* развёртка стен */
  // все стены основного помещения — для пола; с развёрткой — без перегородок к соседним помещениям
  const allSegs = wallsByLetter(st.room).map(w => planSegOf(g, w.id)!);
  const segs = allSegs.filter(sg => !g.noUnfold.has(sg.wall.id));
  const full = new Map(segs.map(sg => [sg, unfRect(g, sg, 0, 0, sg.len, h)]));
  for (const sg of segs) { const r = full.get(sg)!; P.push(R(r.x, r.y, r.w, r.h, 'fill="#FAFAF8" stroke="#111" stroke-width="0.3"')); }
  // выпрямленные снимки стен — только на экране (decisions.md, этап 9)
  if (opts.wallImages) for (const wp of st.wallPhotos) P.push(wallImage(g, st, wp, opts.wallImages[wp.id]));
  // линии сгиба
  if (floorD) P.push(`<path d="${floorD}" fill="none" stroke="#111" stroke-width="0.25" stroke-dasharray="4 1 0.6 1"/>`);
  // подписи стен — у внешнего края развёртки; если полоса узкая (мелкий масштаб) — снаружи, чтобы не налезать на окна
  const outside = h * s < 22;
  for (const sg of segs) {
    const r = full.get(sg)!, mid = wallPt(g, sg, sg.len / 2);
    const label = `СТЕНА ${sg.wall.letter}${sg.wall.name ? ' — ' + sg.wall.name : ''} (развёртка)`;
    const o = { size: 2.5, anchor: 'middle', weight: 700, fill: '#444', rot: textRot(sg) } as const;
    if (sg.side === 'top') P.push(T(mid[0], outside ? r.y - 1.2 : r.y + 3.6, label, o));
    else if (sg.side === 'bottom') P.push(T(mid[0], outside ? r.y + r.h + 3.2 : r.y + r.h - 1.6, label, o));
    else if (sg.side === 'left') P.push(T(outside ? r.x - 1.2 : r.x + 3.2, mid[1], label, o));
    else P.push(T(outside ? r.x + r.w + 1.2 : r.x + r.w - 3.2, mid[1], label, o));
  }

  /* элементы на развёртке */
  for (const it of st.wallItems) {
    const sg = segOf(g, it.wallId);
    if (!sg) continue;
    const r = unfRect(g, sg, toM(it.off.mm), toM(it.z.mm), toM(it.w.mm), toM(it.h.mm));
    const vert = isVert(sg);
    const a = `data-kind="wi" data-id="${it.id}" style="cursor:move"`;
    let body = '';
    if (it.type === 'window') {
      body += R(r.x, r.y, r.w, r.h, 'fill="#EAF1F5" stroke="#111" stroke-width="0.3"');
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      body += vert ? Ln(r.x, cy, r.x + r.w, cy, 'stroke="#111" stroke-width="0.2"') : Ln(cx, r.y, cx, r.y + r.h, 'stroke="#111" stroke-width="0.2"');
      if (it.open) { body += `<path d="M${r.x} ${r.y} L${r.x + r.w} ${cy} L${r.x} ${r.y + r.h}" fill="none" stroke="#111" stroke-width="0.25" stroke-dasharray="1 0.6"/>`; }
    } else if (it.type === 'door') {
      body += R(r.x, r.y, r.w, r.h, 'fill="#F1ECE2" stroke="#111" stroke-width="0.35"');
    } else if (it.type === 'radiator') {
      body += R(r.x, r.y, r.w, r.h, 'fill="#fff" stroke="#111" stroke-width="0.25"');
      const n = Math.max(3, Math.round((vert ? r.h : r.w) / 1.2));
      for (let i = 1; i < n; i++) { body += vert ? Ln(r.x, r.y + r.h * i / n, r.x + r.w, r.y + r.h * i / n, 'stroke="#111" stroke-width="0.12"') : Ln(r.x + r.w * i / n, r.y, r.x + r.w * i / n, r.y + r.h, 'stroke="#111" stroke-width="0.12"'); }
    } else if (it.type === 'board' || it.type === 'screen') {
      body += R(r.x, r.y, r.w, r.h, `fill="${it.type === 'board' ? '#E3E8E4' : '#fff'}" stroke="#111" stroke-width="0.35"`);
    } else if (it.type === 'picture') {
      body += R(r.x, r.y, r.w, r.h, 'fill="#fff" stroke="#111" stroke-width="0.3"') + R(r.x + 0.7, r.y + 0.7, Math.max(0, r.w - 1.4), Math.max(0, r.h - 1.4), 'fill="none" stroke="#111" stroke-width="0.15"');
    } else {
      body += R(r.x, r.y, r.w, r.h, 'fill="#fff" stroke="#111" stroke-width="0.3"');
    }
    const lab = it.label || (it.type === 'window' || it.type === 'radiator' ? '' : WI_TYPES[it.type].toLowerCase());
    if (lab) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const fits = (vert ? r.h : r.w) > lab.length * 1.05;
      const rot = textRot(sg);
      if (fits) body += T(cx, cy, lab, { size: 2, anchor: 'middle', base: 'central', rot });
      else {
        // не влезает — подпись рядом с элементом
        const o = outward(sg); const tx = vert ? r.x + r.w / 2 : cx, ty = vert ? cy : r.y + r.h / 2;
        body += T(tx + (vert ? o[0] * (r.w / 2 + 2.6) : 0), ty + (vert ? 0 : -r.h / 2 - 1.2), lab, { size: 2, anchor: 'middle', base: 'central', rot });
      }
    }
    body = tint(body, !measured(it.off, it.z, it.w, it.h));
    if (selA('wi', it.id)) body += R(r.x - 0.8, r.y - 0.8, r.w + 1.6, r.h + 1.6, SEL);
    P.push(`<g ${a}>${body}<rect x="${r.x - 1}" y="${r.y - 1}" width="${r.w + 2}" height="${r.h + 2}" fill="transparent"/></g>`);
  }

  /* пол */
  if (floorD) P.push(`<path d="${floorD}" fill="#fff"/>`);
  // соседние помещения — пол без развёрток (этап 12)
  const annexD = g.annexSegs.map(segPath(g));
  for (const d of annexD) P.push(`<path d="${d}" fill="#fff"/>`);
  const u = st.underlay;
  if (u.src && u.show) {
    const k = (u.scale || 100) / 100;
    P.push(`<image href="${u.src}" x="${fx + toM(u.dx) * s}" y="${fy + toM(u.dy) * s}" width="${L * s * k}" height="${W * s * k}" preserveAspectRatio="xMidYMid meet" opacity="${u.opacity}"/>`);
  }
  if (opts.grid && floorD) P.push(gridLines(g, opts.grid, floorD));
  for (const it of st.items) {
    const [x, y] = floorPt(g, toM(it.x.mm), toM(it.y.mm)), w = toM(it.w.mm) * s, d = toM(it.d.mm) * s;
    let b = '';
    const symbol = itemSymbol(it.type, x, y, w, d);
    if (symbol) {
      b += symbol;
    } else if (it.type === 'projector') {
      b += R(x, y, w, d, 'fill="none" stroke="#111" stroke-width="0.25" stroke-dasharray="1 0.6"') + Ln(x, y, x + w, y + d, 'stroke="#111" stroke-width="0.15"') + Ln(x + w, y, x, y + d, 'stroke="#111" stroke-width="0.15"');
    } else if (it.type === 'teacher') {
      b += R(x, y, w, d, 'fill="#ECECEC" stroke="#111" stroke-width="0.35"');
    } else if (it.type === 'lectern') {
      b += R(x, y, w, d, 'fill="#fff" stroke="#111" stroke-width="0.35"') + T(x + w / 2, y + d / 2, 'К', { size: Math.min(w, d) * 0.6, anchor: 'middle', base: 'central', weight: 700 });
    } else if (it.type === 'cabinet') {
      b += R(x, y, w, d, 'fill="#fff" stroke="#111" stroke-width="0.3"') + Ln(x, y, x + w, y + d, 'stroke="#111" stroke-width="0.15"');
    } else if (it.type === 'chair') {
      b += R(x, y, w, d, 'fill="#fff" stroke="#111" stroke-width="0.2"');
    } else {
      b += R(x, y, w, d, 'fill="#fff" stroke="#111" stroke-width="0.25"');
    }
    if (it.label) { const rot = d > w * 1.6 && it.label.length * 1.0 > w ? -90 : 0; b += T(x + w / 2, y + d / 2, it.label, { size: 1.8, anchor: 'middle', base: 'central', rot }); }
    b = tint(b, !measured(it.x, it.y, it.w, it.d));
    if (selA('it', it.id)) {
      b += R(x - 0.8, y - 0.8, w + 1.6, d + 1.6, SEL);
      // ручка поворота над верхней стороной — только на экране
      b += Ln(x + w / 2, y - 0.8, x + w / 2, y - 5, SEL) +
        `<circle data-handle="rot" data-id="${it.id}" cx="${x + w / 2}" cy="${y - 6.2}" r="1.4" fill="#fff" stroke="#2F6FB3" stroke-width="0.5" style="cursor:grab"/>`;
    }
    // поворот вокруг центра; без поворота — без transform, лист прежних версий не меняется
    const tr = it.angle ? ` transform="rotate(${it.angle} ${x + w / 2} ${y + d / 2})"` : '';
    P.push(`<g data-kind="it" data-id="${it.id}" style="cursor:move"${tr}>${b}</g>`);
  }
  // контур помещения
  if (floorD) P.push(`<path d="${floorD}" fill="none" stroke="#111" stroke-width="0.9"/>`);
  for (const d of annexD) P.push(`<path d="${d}" fill="none" stroke="#111" stroke-width="0.9"/>`);
  // название и длины стен соседних помещений
  st.annexes.forEach((a, k) => {
    const sgs = g.annexSegs[k]!;
    const xs = sgs.map(sg => sg.ax), ys = sgs.map(sg => sg.ay);
    const [cx, cy] = floorPt(g, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
    P.push(T(cx, cy, annexName(st, a.id).toUpperCase(), { size: 2.6, anchor: 'middle', base: 'central', weight: 700, fill: '#555' }));
    for (const sg of sgs) {
      const w = sg.wall, mid = wallPt(g, sg, sg.len / 2), n = inward(sg);
      let txt = `${fmt(sg.len)} м`;
      if (!measured(w.length)) { anyBlank = true; txt = '____ м'; }
      P.push(clickable(T(mid[0] + n[0] * 2.4, mid[1] + n[1] * 2.4, txt, { size: 2, anchor: 'middle', base: 'central', fill: '#333', rot: isVert(sg) ? -90 : 0 }), 'wall:' + w.id));
    }
  });
  // проёмы и радиаторы на плане
  for (const it of st.wallItems) {
    if (!['window', 'door', 'radiator'].includes(it.type)) continue;
    const sg = planSegOf(g, it.wallId);
    if (!sg) continue;
    const off = toM(it.off.mm), iw = toM(it.w.mm);
    const p1 = wallPt(g, sg, off), p2 = wallPt(g, sg, off + iw), n = inward(sg);
    let b = '';
    if (it.type === 'radiator') {
      const a = [p1[0] + n[0] * 0.08 * s, p1[1] + n[1] * 0.08 * s] as const, c = [p2[0] + n[0] * 0.22 * s, p2[1] + n[1] * 0.22 * s] as const;
      b += R(Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]), 'fill="#fff" stroke="#111" stroke-width="0.2"');
    } else {
      b += Ln(p1[0], p1[1], p2[0], p2[1], 'stroke="#fff" stroke-width="1.4"');
      const o = 0.45;
      b += Ln(p1[0] - n[0] * o, p1[1] - n[1] * o, p1[0] + n[0] * o, p1[1] + n[1] * o, 'stroke="#111" stroke-width="0.35"');
      b += Ln(p2[0] - n[0] * o, p2[1] - n[1] * o, p2[0] + n[0] * o, p2[1] + n[1] * o, 'stroke="#111" stroke-width="0.35"');
      if (it.type === 'window') {
        for (const k of [-0.3, 0.3]) b += Ln(p1[0] + n[0] * k, p1[1] + n[1] * k, p2[0] + n[0] * k, p2[1] + n[1] * k, 'stroke="#111" stroke-width="0.15"');
      }
      const hinge = it.hinge === 'end' ? p2 : p1, other = it.hinge === 'end' ? p1 : p2;
      const len = Math.hypot(other[0] - hinge[0], other[1] - hinge[1]);
      if (it.type === 'door' || it.open) {
        const r = it.type === 'door' ? len : len * 0.55;
        const uu = [(other[0] - hinge[0]) / len, (other[1] - hinge[1]) / len] as const;
        const ang = it.type === 'door' ? Math.PI / 2 : Math.PI / 4;
        const leaf = [hinge[0] + r * (Math.cos(ang) * uu[0] + Math.sin(ang) * n[0]), hinge[1] + r * (Math.cos(ang) * uu[1] + Math.sin(ang) * n[1])] as const;
        b += Ln(hinge[0], hinge[1], leaf[0], leaf[1], `stroke="#111" stroke-width="${it.type === 'door' ? 0.35 : 0.3}"`);
        const pts: string[] = [];
        for (let i = 0; i <= 14; i++) { const t = ang * i / 14; pts.push([hinge[0] + r * (Math.cos(t) * uu[0] + Math.sin(t) * n[0]), hinge[1] + r * (Math.cos(t) * uu[1] + Math.sin(t) * n[1])].map(v => v.toFixed(2)).join(',')); }
        b += `<polyline points="${pts.join(' ')}" fill="none" stroke="#111" stroke-width="0.15" stroke-dasharray="0.8 0.5"/>`;
      }
      if (it.type === 'door' && it.label) {
        // подпись двери — внутрь помещения, за дугой открывания, чтобы не перекрывать развёртку
        const mi = [(p1[0] + p2[0]) / 2 + n[0] * (len + 2.2), (p1[1] + p2[1]) / 2 + n[1] * (len + 2.2)] as const;
        b += T(mi[0], mi[1], it.label, { size: 2.2, anchor: 'middle', base: 'central', weight: 700 });
      }
    }
    b = tint(b, !measured(it.off, it.w));
    P.push(`<g data-kind="wi" data-id="${it.id}" style="cursor:move">${b}</g>`);
  }

  /* размеры: замеренное — числом, условное — пустой строкой (decisions.md) */
  const dimTxt = (name: string, v: number, d: Dim) => {
    if (measured(d)) return `${name} = ${fmt(v)} м`;
    anyBlank = true;
    return `${name} = ________ м`;
  };
  const dimH = (x1: number, x2: number, y: number, txt: string) => Ln(x1, y, x2, y, 'stroke="#111" stroke-width="0.18"') + Ln(x1, y - 1.5, x1, y + 1.5, 'stroke="#111" stroke-width="0.18"') + Ln(x2, y - 1.5, x2, y + 1.5, 'stroke="#111" stroke-width="0.18"') + Ln(x1 - 0.9, y + 0.9, x1 + 0.9, y - 0.9, 'stroke="#111" stroke-width="0.35"') + Ln(x2 - 0.9, y + 0.9, x2 + 0.9, y - 0.9, 'stroke="#111" stroke-width="0.35"') + T((x1 + x2) / 2, y - 1.1, txt, { size: 2.4, anchor: 'middle' });
  const dimV = (x: number, y1: number, y2: number, txt: string) => Ln(x, y1, x, y2, 'stroke="#111" stroke-width="0.18"') + Ln(x - 1.5, y1, x + 1.5, y1, 'stroke="#111" stroke-width="0.18"') + Ln(x - 1.5, y2, x + 1.5, y2, 'stroke="#111" stroke-width="0.18"') + Ln(x - 0.9, y1 + 0.9, x + 0.9, y1 - 0.9, 'stroke="#111" stroke-width="0.35"') + Ln(x - 0.9, y2 + 0.9, x + 0.9, y2 - 0.9, 'stroke="#111" stroke-width="0.35"') + T(x - 1.1, (y1 + y2) / 2, txt, { size: 2.4, anchor: 'middle', rot: -90 });
  if (size) {
    P.push(clickable(dimH(fx, fx + L * s, fy - h * s - 5, dimTxt('L (длина помещения)', L, size.L)), 'room:L'));
    P.push(clickable(dimV(fx - h * s - 5, fy, fy + W * s, dimTxt('W (ширина)', W, size.W)), 'room:W'));
    P.push(clickable(dimV(fx + L * s + 6, fy - h * s, fy, dimTxt('h', h, st.room.height)), 'room:h'));
  } else if (!noRoom(st.room)) {
    // нарисованная комната: длина у каждой стены — внутри пола вдоль стены; h — у конца стены А
    for (const sg of allSegs) {
      const w = sg.wall, mid = wallPt(g, sg, sg.len / 2), n = inward(sg);
      let txt = `${w.letter}: ${fmt(sg.len)} м`;
      if (!measured(w.length)) { anyBlank = true; txt = `${w.letter}: ____ м`; }
      P.push(clickable(T(mid[0] + n[0] * 2.4, mid[1] + n[1] * 2.4, txt, { size: 2.2, anchor: 'middle', base: 'central', fill: '#333', rot: isVert(sg) ? -90 : 0 }), 'wall:' + w.id));
    }
    const a = segs[0];
    if (a) {
      const p0 = wallPt(g, a, a.len), p1 = unf(g, a, a.len, h), off = 4;
      const x0 = p0[0] + a.ux * off, y0 = p0[1] + a.uy * off, x1 = p1[0] + a.ux * off, y1 = p1[1] + a.uy * off;
      P.push(clickable(Ln(x0, y0, x1, y1, 'stroke="#111" stroke-width="0.18"') + T((x0 + x1) / 2 + a.ux * 1.4, (y0 + y1) / 2 + a.uy * 1.4, dimTxt('h', h, st.room.height), { size: 2.4, anchor: 'middle', base: 'central', rot: isVert(a) ? 0 : -90 }), 'room:h'));
    }
  }

  /* метки */
  for (const m of st.markers) {
    let x: number, y: number, extra = '';
    if (m.place === 'floor') {
      const mx = toM(m.x.mm), my = toM(m.y.mm);
      [x, y] = floorPt(g, mx, my);
      if (st.sheet.showTies) {
        // привязка к двум ближайшим стенам; от дальней стены расстояние зависит и от размера помещения
        const lab = (v: number, ...ds: Dim[]) => { if (measured(...ds)) return fmt(v); anyBlank = true; return '____'; };
        // от дальней стены расстояние зависит и от размера помещения: у прямоугольника — L или W, у нарисованной — всех стен
        const farDims = (axis: 'x' | 'y'): Dim[] => (size ? [axis === 'x' ? size.L : size.W] : st.room.walls.map(w => w.length));
        const tx = tieOf(st, m, 'x'), ty = tieOf(st, m, 'y');
        if (tx) {
          const wx = fx + toM(tx.at) * s, labX = lab(toM(tx.mm), m.x, ...(tx.far ? farDims('x') : []));
          extra += Ln(x, y, wx, y, 'stroke="#2B5D8A" stroke-width="0.18" stroke-dasharray="1 0.6"') + clickable(T((x + wx) / 2, y - 0.9, labX, { size: 1.9, anchor: 'middle', fill: '#2B5D8A' }), `tie:${m.id}:x`);
        }
        if (ty) {
          const wy = fy + toM(ty.at) * s, labY = lab(toM(ty.mm), m.y, ...(ty.far ? farDims('y') : []));
          extra += Ln(x, y, x, wy, 'stroke="#2B5D8A" stroke-width="0.18" stroke-dasharray="1 0.6"') + clickable(T(x + 0.9, (y + wy) / 2, labY, { size: 1.9, fill: '#2B5D8A', base: 'central' }), `tie:${m.id}:y`);
        }
      }
    } else {
      const sg = segOf(g, m.wallId);
      if (!sg) continue;
      if (m.place === 'wall') {
        [x, y] = unf(g, sg, toM(m.off.mm), toM(m.z.mm));
      } else {
        const p = unf(g, sg, toM(m.off.mm), h), o = outward(sg);
        x = p[0] + o[0] * 7; y = p[1] + o[1] * 7;
        extra += Ln(x, y, p[0], p[1], 'stroke="#111" stroke-width="0.15" stroke-dasharray="0.8 0.5"');
        const vert = isVert(sg);
        extra += T(x + (vert ? 0 : 4), y + (vert ? 5 : 0.9), 'снаружи', { size: 1.9, anchor: vert ? 'middle' : 'start', fill: '#333' });
      }
    }
    let b = extra + (opts.touch ? `<circle cx="${x}" cy="${y}" r="6" fill="transparent"/>` : '') + marker(x, y, m.n);
    if (selA('mk', m.id)) b += `<circle cx="${x}" cy="${y}" r="4" ${SEL}/>`;
    P.push(`<g data-kind="mk" data-id="${m.id}" style="cursor:move">${b}</g>`);
  }

  /* выноски */
  for (const c of st.callouts) P.push(callout(g, c, selA('co', c.id)));

  /* линейный масштаб «0—1—2 м» — только в масштабе: по нему проверяют печать линейкой */
  if (sc) P.push(scaleBar(lay.area.x + 2, lay.area.y + lay.area.h - 3, s));

  /* север */
  const nv = parseFloat(String(st.north).replace(',', '.'));
  if (!isNaN(nv)) {
    const { x: cx, y: cy } = lay.north;
    P.push(`<g transform="rotate(${nv} ${cx} ${cy})">` + `<path d="M${cx} ${cy - 7} L${cx + 2.2} ${cy + 4} L${cx} ${cy + 2.4} L${cx - 2.2} ${cy + 4} Z" fill="#111"/>` + T(cx, cy - 8.5, 'С', { size: 3.2, anchor: 'middle', weight: 700 }) + '</g>');
  }

  /* правая колонка */
  let y = 33; const x0 = lay.colX + 4;
  P.push(T(x0, y, 'Условные обозначения', { size: 3.2, weight: 700 })); y += 5;
  for (const m of st.markers) {
    const lines = wrap(m.desc || '—', lay.legendChars);
    P.push(marker(x0 + 2.6, y + 0.4, m.n, 2.4));
    lines.forEach((l, i) => P.push(T(x0 + 7, y + 1.2 + i * 3.1, l, { size: 2.4 })));
    y += Math.max(6, lines.length * 3.1 + 2.6);
  }
  y += 1;
  // в легенде — только то, что есть на плане
  const used = new Set<string>([...st.wallItems.map(i => i.type + (i.type === 'window' && i.open ? '_open' : '')), ...st.items.map(i => i.type)]);
  // знаки сначала собираем, потом раскладываем: в колонку справа (A3) или блоком под чертежом (A4)
  const syms: [(x: number, yy: number) => string, string][] = [];
  const sym = (draw: (x: number, yy: number) => string, label: string) => { syms.push([draw, label]); };
  const K = 'stroke="#111"';
  if (used.has('window') || used.has('window_open')) sym((x, yy) => Ln(x, yy + 1.5, x + 10, yy + 1.5, `${K} stroke-width="0.9"`) + Ln(x + 2, yy + 1.5, x + 8, yy + 1.5, 'stroke="#fff" stroke-width="1.4"') + Ln(x + 2, yy + 1.2, x + 8, yy + 1.2, `${K} stroke-width="0.15"`) + Ln(x + 2, yy + 1.8, x + 8, yy + 1.8, `${K} stroke-width="0.15"`), 'Оконный проём');
  if (used.has('window_open')) sym((x, yy) => Ln(x, yy + 1, x + 10, yy + 1, `${K} stroke-width="0.9"`) + Ln(x + 2, yy + 1, x + 8, yy + 1, 'stroke="#fff" stroke-width="1.4"') + Ln(x + 2, yy + 1, x + 4.4, yy + 3.4, `${K} stroke-width="0.3"`), 'Створка окна, открытая внутрь');
  if (used.has('door')) sym((x, yy) => Ln(x, yy, x + 10, yy, `${K} stroke-width="0.9"`) + Ln(x + 2, yy, x + 7, yy, 'stroke="#fff" stroke-width="1.4"') + Ln(x + 2, yy, x + 2, yy + 4, `${K} stroke-width="0.3"`) + `<path d="M${x + 2} ${yy + 4} A4 4 0 0 0 ${x + 6.5} ${yy + 0.4}" fill="none" ${K} stroke-width="0.15" stroke-dasharray="0.8 0.5"/>`, 'Дверь (направление открывания)');
  if (used.has('radiator')) sym((x, yy) => R(x + 1, yy + 0.6, 8, 2, `fill="#fff" ${K} stroke-width="0.2"`) + [3, 5, 7].map(i => Ln(x + i, yy + 0.6, x + i, yy + 2.6, `${K} stroke-width="0.12"`)).join(''), 'Радиатор отопления');
  if (used.has('desk') || used.has('table')) sym((x, yy) => R(x + 1, yy, 8, 3, `fill="#fff" ${K} stroke-width="0.25"`), 'Стол');
  if (used.has('chair')) sym((x, yy) => R(x + 3.5, yy + 0.3, 2.4, 2.4, `fill="#fff" ${K} stroke-width="0.2"`), 'Стул');
  if (used.has('teacher')) sym((x, yy) => R(x + 1, yy, 8, 3, `fill="#ECECEC" ${K} stroke-width="0.35"`), 'Стол преподавателя');
  if (used.has('lectern')) sym((x, yy) => R(x + 3.3, yy, 3, 3, `fill="#fff" ${K} stroke-width="0.35"`) + T(x + 4.8, yy + 1.6, 'К', { size: 2, anchor: 'middle', base: 'central', weight: 700 }), 'Кафедра (трибуна)');
  if (used.has('cabinet')) sym((x, yy) => R(x + 1, yy, 8, 3, `fill="#fff" ${K} stroke-width="0.3"`) + Ln(x + 1, yy, x + 9, yy + 3, `${K} stroke-width="0.15"`), 'Шкаф');
  for (const t of SYMBOL_TYPES) {
    if (!used.has(t)) continue;
    const [bw, bd] = LEGEND_BOX[t]!;
    sym((x, yy) => itemSymbol(t, x + 5 - bw / 2, yy + 1.5 - bd / 2, bw, bd)!, IT_TYPES[t]);
  }
  if (used.has('projector')) sym((x, yy) => R(x + 3.3, yy, 3, 3, `fill="none" ${K} stroke-width="0.25" stroke-dasharray="1 0.6"`) + Ln(x + 3.3, yy, x + 6.3, yy + 3, `${K} stroke-width="0.15"`) + Ln(x + 6.3, yy, x + 3.3, yy + 3, `${K} stroke-width="0.15"`), 'Проектор (на потолке)');
  sym((x, yy) => Ln(x, yy + 1.5, x + 10, yy + 1.5, `${K} stroke-width="0.25" stroke-dasharray="4 1 0.6 1"`), 'Линия сгиба (стены развёрнуты на пол)');
  if (st.sheet.showTies && st.markers.some(m => m.place === 'floor')) sym((x, yy) => Ln(x, yy + 1.5, x + 10, yy + 1.5, 'stroke="#2B5D8A" stroke-width="0.25" stroke-dasharray="1 0.6"'), 'Привязка метки к стенам, м');
  if (anyGray) sym((x, yy) => R(x + 1, yy, 8, 3, `fill="#fff" stroke="${GRAY}" stroke-width="0.3"`), 'Не замерено, нанесено приблизительно');

  const box = lay.symbols;
  if (!box) {
    for (const [draw, label] of syms) {
      const lines = wrap(label, lay.legendChars - 4);
      P.push(draw(x0, y));
      lines.forEach((l, i) => P.push(T(x0 + 13, y + 2.2 + i * 3, l, { size: 2.3 })));
      y += 5.2 + (lines.length - 1) * 3;
    }
  } else {
    // по колонкам сверху вниз; не влезает в колонку — следующая
    const cw = box.w / box.cols;
    let col = 0, yy = box.y;
    for (const [draw, label] of syms) {
      const lines = wrap(label, box.chars);
      const hgt = 5.2 + (lines.length - 1) * 3;
      if (yy + hgt > box.y + box.h + 0.01 && yy > box.y) { col++; yy = box.y; }
      const sx = box.x + col * cw;
      P.push(draw(sx, yy));
      lines.forEach((l, i) => P.push(T(sx + 13, yy + 2.2 + i * 3, l, { size: 2.3 })));
      yy += hgt;
    }
  }

  y += 2;
  P.push(T(x0, y, 'Примечания', { size: 3.2, weight: 700 })); y += 4.6;
  const notes: string[] = [];
  notes.push(sc ? `План выполнен в масштабе 1:${st.sheet.scale}.` : 'Схема составлена по фотоснимкам, масштаб не соблюдён.');
  const roomDims: (readonly [string, Dim])[] = noRoom(st.room) ? [] : size
    ? [['L', size.L], ['W', size.W], ['h', st.room.height]]
    : [...st.room.walls.map(w => [w.letter, w.length] as const), ['h', st.room.height] as const];
  const roomApprox = roomDims.filter(([, d]) => !measured(d)).map(([n]) => n);
  if (sc && roomApprox.length) notes.push(`${roomApprox.length > 1 ? 'Размеры' : 'Размер'} помещения ${roomApprox.join(', ')} не ${roomApprox.length > 1 ? 'замерены, нанесены' : 'замерен, нанесён'} приблизительно.`);
  if (anyGray) notes.push('Положение объектов, показанных серым, нанесено приблизительно.');
  const approxMarkers = st.markers.filter(markerApprox).map(m => m.n);
  if (sc && approxMarkers.length) notes.push(`Положение ${approxMarkers.length > 1 ? 'меток № ' + approxMarkers.join(', ') : 'метки № ' + approxMarkers[0]} нанесено приблизительно.`);
  if (anyBlank) notes.push(rect || noRoom(st.room) ? 'Размеры L, W, h и расстояния от меток до стен внести по результатам замеров.' : 'Длины стен, высоту h и расстояния от меток до стен внести по результатам замеров.');
  const mNote = measureNote(st);
  if (mNote) notes.push(mNote);
  notes.push(isNaN(nv) ? 'Направление на север: ______________' : 'Направление на север указано стрелкой «С».');
  st.markers.filter(m => m.place === 'outside').forEach(m => notes.push(`Метка № ${m.n} находится вне помещения.`));
  // перегородки к соседним помещениям — без развёрток (этап 12)
  const hidden = allSegsOf(st, g).filter(sg => g.noUnfold.has(sg.wall.id)).map(sg => sg.wall.letter);
  if (hidden.length) notes.push(`${hidden.length > 1 ? 'Развёртки стен ' + hidden.join(', ') + ' не показаны: к ним' : 'Развёртка стены ' + hidden[0] + ' не показана: к ней'} примыкает соседнее помещение.`);
  String(st.notes || '').split('\n').map(t => t.trim()).filter(Boolean).forEach(t => notes.push(t));
  notes.forEach((n, i) => { wrap(`${i + 1}. ${n}`, lay.notesChars).forEach((l, j) => { P.push(T(x0 + (j ? 3 : 0), y, l, { size: 2.4 })); y += 3.1; }); y += 0.5; });

  /* штамп — как в образце: подписи жирным, «Лист» в строке масштаба; длинное значение переносится */
  const lw = lay.stampLabelW, sx = lay.colX, sw = right - lay.colX;
  const rows: [string, string][] = [
    ['Наименование', st.stamp.name], ['Объект', st.stamp.object], ['Составил', st.stamp.author],
    ['Участники', st.stamp.members], ['Дата', st.stamp.date],
    ['Масштаб', sc ? `1:${st.sheet.scale}` : 'без масштаба'],
  ];
  const wrapped = rows.map(r => wrap(r[1] || '', lay.stampChars).slice(0, 3));
  const heights = wrapped.map(v => Math.max(6.6, v.length * 3.1 + 3.5));
  const total = heights.reduce((a, b) => a + b, 0);
  let sy = bottom - total;
  P.push(R(sx, sy, sw, total, 'fill="#fff" stroke="#111" stroke-width="0.4"'));
  rows.forEach((r, i) => {
    const rh = heights[i]!, v = wrapped[i]!;
    if (i) P.push(Ln(sx, sy, right, sy, 'stroke="#111" stroke-width="0.2"'));
    const top = sy + rh / 2 + 0.9 - (Math.max(1, v.length) - 1) * 1.55;
    P.push(T(sx + 2, top, r[0], { size: 2.4, weight: 700 }));
    v.forEach((l, j) => P.push(T(sx + 4 + lw, top + j * 3.1, l, { size: 2.4 })));
    // «Лист» — в строке масштаба справа, как в образце
    if (i === rows.length - 1) P.push(T(right - 2, top, 'Лист 1 / 1', { size: 2.4, anchor: 'end' }));
    sy += rh;
  });
  P.push(Ln(sx + lw + 2, bottom - total, sx + lw + 2, bottom, 'stroke="#111" stroke-width="0.2"'));

  return P.join('');
}

/** Видимая сетка по полу (только на экране); обрезана по контуру пола */
function gridLines(g: Geom, snap: Mm, floorD: string): string {
  const step = gridLineStep(snap, g.s);
  if (!step) return '';
  const { fx, fy, s, L, W } = g, a = 'stroke="#2F6FB3" stroke-opacity="0.22" stroke-width="0.1"';
  let out = '';
  for (let mm = step; mm < L * 1000 - 1; mm += step) out += Ln(fx + (mm / 1000) * s, fy, fx + (mm / 1000) * s, fy + W * s, a);
  for (let mm = step; mm < W * 1000 - 1; mm += step) out += Ln(fx, fy + (mm / 1000) * s, fx + L * s, fy + (mm / 1000) * s, a);
  return `<clipPath id="floor-clip"><path d="${floorD}"/></clipPath><g pointer-events="none" clip-path="url(#floor-clip)">${out}</g>`;
}

const allSegsOf = (st: Plan, g: Geom): Seg[] => wallsByLetter(st.room).map(w => planSegOf(g, w.id)).filter((x): x is Seg => !!x);

/** Контур пола на листе — путь по стенам; комнаты нет — пусто */
function floorPath(g: Geom): string {
  return segPath(g)(g.segs);
}

/** Путь по стенам одного помещения */
const segPath = (g: Geom) => (segs: readonly Seg[]): string => {
  if (!segs.length) return '';
  return segs.map((sg, i) => { const [x, y] = floorPt(g, sg.ax, sg.ay); return `${i ? 'L' : 'M'}${+x.toFixed(3)} ${+y.toFixed(3)}`; }).join(' ') + ' Z';
};

/** Ширина строки текста на листе, мм (оценка: средняя буква PT Sans — половина кегля) */
const textW = (str: string, size: number) => str.length * size * 0.52;

/**
 * Выноска как в черчении: текст над полкой, от ближнего к цели конца полки — линия со стрелкой.
 * at — левый конец полки.
 */
export function callout(g: Geom, c: Callout, selected = false): string {
  const SIZE = 2.4;
  const [ax, ay] = floorPt(g, toM(c.at.x), toM(c.at.y));
  const [tx, ty] = floorPt(g, toM(c.target.x), toM(c.target.y));
  const lines = c.text.trim() ? c.text.split('\n').flatMap(l => wrap(l, 36)) : [];
  const shelf = Math.max(8, ...lines.map(l => textW(l, SIZE) + 1.2));
  const ex = Math.abs(tx - ax) <= Math.abs(tx - (ax + shelf)) ? ax : ax + shelf;
  let b = Ln(ax, ay, ax + shelf, ay, 'stroke="#111" stroke-width="0.25"');
  lines.forEach((l, i) => { b += T(ax + 0.6, ay - 0.9 - (lines.length - 1 - i) * 3.1, l, { size: SIZE }); });
  // стрелка: линия до основания наконечника, наконечник — залитый треугольник
  const len = Math.hypot(tx - ex, ty - ay);
  if (len > 0.5) {
    const ux = (tx - ex) / len, uy = (ty - ay) / len, hl = Math.min(2, len), hw = 0.7;
    const bx = tx - ux * hl, by = ty - uy * hl;
    b += Ln(ex, ay, bx, by, 'stroke="#111" stroke-width="0.2"');
    b += `<path d="M${tx} ${ty} L${bx - uy * hw} ${by + ux * hw} L${bx + uy * hw} ${by - ux * hw} Z" fill="#111"/>`;
  }
  const top = ay - 0.9 - lines.length * 3.1 - 0.4;
  // прозрачная подложка, чтобы подпись было легко схватить мышью
  b += R(ax, top, shelf, ay - top + 0.8, 'fill="transparent"');
  if (selected) {
    b += R(ax - 0.8, top - 0.8, shelf + 1.6, ay - top + 2.4, SEL);
    b += `<circle data-handle="tip" data-id="${c.id}" cx="${tx}" cy="${ty}" r="1.5" fill="#fff" fill-opacity="0.6" stroke="#2F6FB3" stroke-width="0.5" style="cursor:crosshair"/>`;
  }
  return `<g data-kind="co" data-id="${c.id}" style="cursor:move">${b}</g>`;
}

/** Линейный масштаб: два отрезка по 1 м (чёрный и белый) и подписи 0, 1, 2 м */
function scaleBar(x: number, y: number, s: number): string {
  const hgt = 1.4;
  return '<g>' +
    R(x, y, s, hgt, 'fill="#111" stroke="#111" stroke-width="0.2"') +
    R(x + s, y, s, hgt, 'fill="#fff" stroke="#111" stroke-width="0.2"') +
    T(x, y - 0.8, '0', { size: 2.2, anchor: 'middle' }) +
    T(x + s, y - 0.8, '1', { size: 2.2, anchor: 'middle' }) +
    T(x + 2 * s, y - 0.8, '2', { size: 2.2, anchor: 'middle' }) +
    T(x + 2 * s + 2, y + hgt, 'м', { size: 2.2 }) +
    '</g>';
}

export interface SvgFileOpts {
  /** CSS со встроенным шрифтом (@font-face с data: URL), чтобы файл выглядел одинаково везде */
  fontCss?: string;
}

/** Лист целиком — для файлов SVG, PNG и PDF: реальный размер в миллиметрах, без рамок выделения */
export function sheetSvg(st: Plan, o: SvgFileOpts = {}): string {
  const lay = sheetLayout(st);
  const defs = o.fontCss ? `<defs><style>${o.fontCss}</style></defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lay.w}mm" height="${lay.h}mm" viewBox="0 0 ${lay.w} ${lay.h}">${defs}${drawSheet(st)}</svg>`;
}

/** Выпрямленный кадр на развёртке своей стены: верх картинки — потолок, низ — пол */
function wallImage(g: Geom, st: Plan, wp: WallPhoto, url: string | undefined): string {
  const sg = segOf(g, wp.wallId), span = frameSpan(st, wp);
  if (!url || !wp.show || !sg || !span) return '';
  const o = unf(g, sg, toM(span.from), g.h), u = unf(g, sg, toM(span.to), g.h), v = unf(g, sg, toM(span.from), 0);
  const m = [u[0] - o[0], u[1] - o[1], v[0] - o[0], v[1] - o[1], o[0], o[1]].map(n => +n.toFixed(3)).join(' ');
  return `<image href="${esc(url)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" opacity="${wp.opacity}" pointer-events="none" transform="matrix(${m})"/>`;
}
