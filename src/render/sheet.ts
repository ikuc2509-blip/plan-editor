// План → SVG листа A3. Один и тот же код рисует лист на экране, в SVG и в PDF.
import type { Plan, Selection } from '../model/types';
import { WI_TYPES } from '../model/labels';
import { wallsByLetter } from '../model/room';
import { toM } from '../model/units';
import { floorPt, geom, inward, outward, segOf, textRot, unf, unfRect, wallPt, type Seg } from '../geometry/unfold';
import { Ln, R, T, fmt, marker, wrap } from './svg';

export const SHEET_W = 420;
export const SHEET_H = 297;

export interface DrawOpts {
  /** выделенный объект; для файлов не передаётся — рамки выделения не рисуются */
  sel?: Selection | null;
}

const SEL = 'stroke="#2F6FB3" stroke-width="0.7" fill="none"';
const isVert = (sg: Seg) => sg.side === 'left' || sg.side === 'right';

/** Содержимое листа (без корневого тега svg) */
export function drawSheet(st: Plan, opts: DrawOpts = {}): string {
  const g = geom(st.room, st.sheet), P: string[] = [];
  const { fx, fy, s, L, W, h } = g;
  const sc = st.sheet.mode === 'scale';
  const sel = opts.sel ?? null;
  const selA = (kind: Selection['kind'], id: string) => !!sel && sel.kind === kind && sel.id === id;

  P.push(R(0, 0, 420, 297, 'fill="#fff"'));
  P.push(R(20, 5, 395, 287, 'fill="none" stroke="#111" stroke-width="0.5"'));
  P.push(Ln(20, 24, 415, 24, 'stroke="#111" stroke-width="0.3"'));
  P.push(Ln(292, 24, 292, 292, 'stroke="#111" stroke-width="0.3"'));
  P.push(T(217.5, 13, 'Развёрнутый план помещения (план-схема с развёрткой стен)', { size: 4.4, anchor: 'middle', weight: 700 }));
  const sub = [st.stamp.object, st.stamp.protocol].filter(Boolean).join(' — ');
  if (sub) P.push(T(217.5, 19.6, sub, { size: 2.9, anchor: 'middle' }));

  /* развёртка стен */
  const segs = wallsByLetter(st.room).map(w => segOf(g, w.id)!);
  const full = new Map(segs.map(sg => [sg, unfRect(g, sg, 0, 0, sg.len, h)]));
  for (const sg of segs) { const r = full.get(sg)!; P.push(R(r.x, r.y, r.w, r.h, 'fill="#FAFAF8" stroke="#111" stroke-width="0.3"')); }
  // линии сгиба
  P.push(R(fx, fy, L * s, W * s, 'fill="none" stroke="#111" stroke-width="0.25" stroke-dasharray="4 1 0.6 1"'));
  // подписи стен — у внешнего края развёртки
  for (const sg of segs) {
    const r = full.get(sg)!, mid = wallPt(g, sg, sg.len / 2);
    const label = `СТЕНА ${sg.wall.letter}${sg.wall.name ? ' — ' + sg.wall.name : ''} (развёртка)`;
    const o = { size: 2.5, anchor: 'middle', weight: 700, fill: '#444', rot: textRot(sg) } as const;
    if (sg.side === 'top') P.push(T(mid[0], r.y + 3.6, label, o));
    else if (sg.side === 'bottom') P.push(T(mid[0], r.y + r.h - 1.6, label, o));
    else if (sg.side === 'left') P.push(T(r.x + 3.2, mid[1], label, o));
    else P.push(T(r.x + r.w - 3.2, mid[1], label, o));
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
    if (selA('wi', it.id)) body += R(r.x - 0.8, r.y - 0.8, r.w + 1.6, r.h + 1.6, SEL);
    P.push(`<g ${a}>${body}<rect x="${r.x - 1}" y="${r.y - 1}" width="${r.w + 2}" height="${r.h + 2}" fill="transparent"/></g>`);
  }

  /* пол */
  P.push(R(fx, fy, L * s, W * s, 'fill="#fff"'));
  const u = st.underlay;
  if (u.src && u.show) {
    const k = (u.scale || 100) / 100;
    P.push(`<image href="${u.src}" x="${fx + toM(u.dx) * s}" y="${fy + toM(u.dy) * s}" width="${L * s * k}" height="${W * s * k}" preserveAspectRatio="xMidYMid meet" opacity="${u.opacity}"/>`);
  }
  for (const it of st.items) {
    const [x, y] = floorPt(g, toM(it.x.mm), toM(it.y.mm)), w = toM(it.w.mm) * s, d = toM(it.d.mm) * s;
    let b = '';
    if (it.type === 'projector') {
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
    if (selA('it', it.id)) b += R(x - 0.8, y - 0.8, w + 1.6, d + 1.6, SEL);
    P.push(`<g data-kind="it" data-id="${it.id}" style="cursor:move">${b}</g>`);
  }
  // контур помещения
  P.push(R(fx, fy, L * s, W * s, 'fill="none" stroke="#111" stroke-width="0.9"'));
  // проёмы и радиаторы на плане
  for (const it of st.wallItems) {
    if (!['window', 'door', 'radiator'].includes(it.type)) continue;
    const sg = segOf(g, it.wallId);
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
    P.push(`<g data-kind="wi" data-id="${it.id}" style="cursor:move">${b}</g>`);
  }

  /* размеры */
  const dimTxt = (name: string, v: number) => (sc && st.sheet.showDims) ? `${name} = ${fmt(v)} м` : `${name} = ______ м`;
  const dimH = (x1: number, x2: number, y: number, txt: string) => Ln(x1, y, x2, y, 'stroke="#111" stroke-width="0.18"') + Ln(x1, y - 1.5, x1, y + 1.5, 'stroke="#111" stroke-width="0.18"') + Ln(x2, y - 1.5, x2, y + 1.5, 'stroke="#111" stroke-width="0.18"') + Ln(x1 - 0.9, y + 0.9, x1 + 0.9, y - 0.9, 'stroke="#111" stroke-width="0.35"') + Ln(x2 - 0.9, y + 0.9, x2 + 0.9, y - 0.9, 'stroke="#111" stroke-width="0.35"') + T((x1 + x2) / 2, y - 1.1, txt, { size: 2.4, anchor: 'middle' });
  const dimV = (x: number, y1: number, y2: number, txt: string) => Ln(x, y1, x, y2, 'stroke="#111" stroke-width="0.18"') + Ln(x - 1.5, y1, x + 1.5, y1, 'stroke="#111" stroke-width="0.18"') + Ln(x - 1.5, y2, x + 1.5, y2, 'stroke="#111" stroke-width="0.18"') + Ln(x - 0.9, y1 + 0.9, x + 0.9, y1 - 0.9, 'stroke="#111" stroke-width="0.35"') + Ln(x - 0.9, y2 + 0.9, x + 0.9, y2 - 0.9, 'stroke="#111" stroke-width="0.35"') + T(x - 1.1, (y1 + y2) / 2, txt, { size: 2.4, anchor: 'middle', rot: -90 });
  P.push(dimH(fx, fx + L * s, fy - h * s - 5, dimTxt('L', L)));
  P.push(dimV(fx - h * s - 5, fy, fy + W * s, dimTxt('W', W)));
  P.push(dimV(fx + L * s + 6, fy - h * s, fy, dimTxt('h', h)));

  /* метки */
  for (const m of st.markers) {
    let x: number, y: number, extra = '';
    if (m.place === 'floor') {
      const mx = toM(m.x.mm), my = toM(m.y.mm);
      [x, y] = floorPt(g, mx, my);
      if (st.sheet.showTies) {
        // привязка к двум ближайшим стенам
        const toV = mx <= L / 2, toA = my <= W / 2;
        const wx = toV ? fx : fx + L * s, wy = toA ? fy : fy + W * s;
        const dx = toV ? mx : L - mx, dy = toA ? my : W - my;
        const lab = (v: number) => (sc && st.sheet.showDims) ? fmt(v) : '____';
        extra += Ln(x, y, wx, y, 'stroke="#2B5D8A" stroke-width="0.18" stroke-dasharray="1 0.6"') + T((x + wx) / 2, y - 0.9, lab(dx), { size: 1.9, anchor: 'middle', fill: '#2B5D8A' });
        extra += Ln(x, y, x, wy, 'stroke="#2B5D8A" stroke-width="0.18" stroke-dasharray="1 0.6"') + T(x + 0.9, (y + wy) / 2, lab(dy), { size: 1.9, fill: '#2B5D8A', base: 'central' });
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
    let b = extra + marker(x, y, m.n);
    if (selA('mk', m.id)) b += `<circle cx="${x}" cy="${y}" r="4" ${SEL}/>`;
    P.push(`<g data-kind="mk" data-id="${m.id}" style="cursor:move">${b}</g>`);
  }

  /* север */
  const nv = parseFloat(String(st.north).replace(',', '.'));
  if (!isNaN(nv)) {
    const cx = 278, cy = 40;
    P.push(`<g transform="rotate(${nv} ${cx} ${cy})">` + `<path d="M${cx} ${cy - 7} L${cx + 2.2} ${cy + 4} L${cx} ${cy + 2.4} L${cx - 2.2} ${cy + 4} Z" fill="#111"/>` + T(cx, cy - 8.5, 'С', { size: 3.2, anchor: 'middle', weight: 700 }) + '</g>');
  }

  /* правая колонка */
  let y = 33; const x0 = 296;
  P.push(T(x0, y, 'Условные обозначения', { size: 3.2, weight: 700 })); y += 5;
  for (const m of st.markers) {
    const lines = wrap(m.desc || '—', 46);
    P.push(marker(x0 + 2.6, y + 0.4, m.n, 2.4));
    lines.forEach((l, i) => P.push(T(x0 + 7, y + 1.2 + i * 3.1, l, { size: 2.4 })));
    y += Math.max(6, lines.length * 3.1 + 2.6);
  }
  y += 1;
  // в легенде — только то, что есть на плане
  const used = new Set<string>([...st.wallItems.map(i => i.type + (i.type === 'window' && i.open ? '_open' : '')), ...st.items.map(i => i.type)]);
  const sym = (draw: (x: number, yy: number) => string, label: string) => { P.push(draw(x0, y)); P.push(T(x0 + 13, y + 2.2, label, { size: 2.3 })); y += 5.2; };
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
  if (used.has('projector')) sym((x, yy) => R(x + 3.3, yy, 3, 3, `fill="none" ${K} stroke-width="0.25" stroke-dasharray="1 0.6"`) + Ln(x + 3.3, yy, x + 6.3, yy + 3, `${K} stroke-width="0.15"`) + Ln(x + 6.3, yy, x + 3.3, yy + 3, `${K} stroke-width="0.15"`), 'Проектор (на потолке)');
  sym((x, yy) => Ln(x, yy + 1.5, x + 10, yy + 1.5, `${K} stroke-width="0.25" stroke-dasharray="4 1 0.6 1"`), 'Линия сгиба (стены развёрнуты на пол)');
  if (st.sheet.showTies && st.markers.some(m => m.place === 'floor')) sym((x, yy) => Ln(x, yy + 1.5, x + 10, yy + 1.5, 'stroke="#2B5D8A" stroke-width="0.25" stroke-dasharray="1 0.6"'), 'Привязка метки к стенам, м');

  y += 2;
  P.push(T(x0, y, 'Примечания', { size: 3.2, weight: 700 })); y += 4.6;
  const notes: string[] = [];
  notes.push(sc ? `План выполнен в масштабе 1:${st.sheet.scale}.` : 'Схема составлена по фотоснимкам, масштаб не соблюдён.');
  if (!sc || !st.sheet.showDims) notes.push('Размеры L, W, h и расстояния от меток до стен внести по результатам замеров.');
  notes.push(isNaN(nv) ? 'Направление на север: ____________________' : 'Направление на север указано стрелкой «С».');
  st.markers.filter(m => m.place === 'outside').forEach(m => notes.push(`Метка № ${m.n} находится вне помещения.`));
  String(st.notes || '').split('\n').map(t => t.trim()).filter(Boolean).forEach(t => notes.push(t));
  notes.forEach((n, i) => { wrap(`${i + 1}. ${n}`, 48).forEach((l, j) => { P.push(T(x0 + (j ? 3 : 0), y, l, { size: 2.4 })); y += 3.1; }); y += 0.5; });

  /* штамп */
  const rh = 6.6, lw = 30, sy = 292 - rh * 7;
  const rows: [string, string][] = [['Наименование', st.stamp.name], ['Объект', st.stamp.object], ['Составил', st.stamp.author], ['Участники', st.stamp.members], ['Дата', st.stamp.date], ['Масштаб', sc ? `1:${st.sheet.scale}` : 'без масштаба'], ['Лист', '1 / 1']];
  P.push(R(x0 - 4, sy, 123, rh * rows.length, 'fill="#fff" stroke="#111" stroke-width="0.4"'));
  rows.forEach((r, i) => {
    const yy = sy + i * rh; if (i) P.push(Ln(x0 - 4, yy, x0 + 119, yy, 'stroke="#111" stroke-width="0.2"'));
    P.push(T(x0 - 2, yy + rh / 2 + 0.9, r[0], { size: 2.4, weight: 600 }));
    const v = wrap(r[1] || '', 36); P.push(T(x0 + lw, yy + rh / 2 + 0.9, v[0] || '', { size: 2.4 }));
  });
  P.push(Ln(x0 + lw - 2, sy, x0 + lw - 2, sy + rh * rows.length, 'stroke="#111" stroke-width="0.2"'));

  return P.join('');
}

/** Лист целиком — для файлов SVG и PDF: реальный размер в миллиметрах, без рамок выделения */
export function sheetSvg(st: Plan): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297">${drawSheet(st)}</svg>`;
}
