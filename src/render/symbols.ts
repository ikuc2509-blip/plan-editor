// Условные знаки предметов (decisions.md, этапы 5 и 11): одни и те же для плана и легенды.
// Прямоугольник x, y, w, d — в мм листа, до поворота; «верх» знака — сторона y (спинка, изголовье, задняя стенка).
// Вид сверху, «как настоящий» (замечание преподавателя, 0.20.0): подушки, подлокотники, дверцы.
import type { ItemType } from '../model/types';
import { Ln, R, T } from './svg';

const K = 'stroke="#111"';
/** основной контур предмета; f — заливка (цветной лист — по виду предмета, этап 12), k — цвет линии */
const out = (f: string, k = '#111') => `fill="${f}" stroke="${k}" stroke-width="0.3"`;
const thin = (k = '#111', f = 'none') => `fill="${f}" stroke="${k}" stroke-width="0.15"`;
const THIN = thin();

const ellipse = (cx: number, cy: number, rx: number, ry: number, a: string) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${a}/>`;
const circle = (cx: number, cy: number, r: number, a: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${a}/>`;
const rrect = (x: number, y: number, w: number, h: number, r: number, a: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${a}/>`;
const poly = (pts: number[], a: string) => `<polygon points="${pts.map(v => +v.toFixed(3)).join(' ')}" ${a}/>`;

type Draw = (x: number, y: number, w: number, d: number, f: string, k: string) => string;

/** Мягкая мебель: спинка у стороны y, подлокотники шириной aw, n подушек сиденья */
function upholstered(x: number, y: number, w: number, d: number, f: string, k: string, aw: number, n: number): string {
  const m = Math.min(w, d), r = m * 0.1, bd = d * 0.27, g = m * 0.025;
  const cw = (w - 2 * aw) / n;
  let s = rrect(x, y, w, d, r, out(f, k)) + rrect(x, y, w, bd, r, thin(k, f));
  for (let i = 0; i < n; i++) s += rrect(x + aw + i * cw + g, y + bd + g, cw - 2 * g, d - bd - 2 * g, r * 0.6, thin(k, f));
  return s + rrect(x, y, aw, d, r, thin(k, f)) + rrect(x + w - aw, y, aw, d, r, thin(k, f));
}

/** Корпусная мебель: дверцы или ящики у лицевой стороны (y + d), n — сколько, ручки у середины */
function front(x: number, y: number, w: number, d: number, n: number): string {
  const fy = y + d * 0.86, m = Math.min(w, d);
  let s = Ln(x, fy, x + w, fy, `${K} stroke-width="0.15"`);
  for (let i = 1; i < n; i++) s += Ln(x + w * i / n, fy, x + w * i / n, y + d, `${K} stroke-width="0.15"`);
  for (let i = 0; i < n; i++) s += circle(x + w * (i + 0.5) / n, fy + (y + d - fy) / 2, m * 0.035, `fill="#111" ${K} stroke-width="0.05"`);
  return s;
}

const SYMBOLS: Partial<Record<ItemType, Draw>> = {
  /* учебная аудитория и общее */
  // столешница с кромкой
  desk: (x, y, w, d, f) => R(x, y, w, d, out(f)) + R(x + Math.min(w, d) * 0.08, y + Math.min(w, d) * 0.08, w - Math.min(w, d) * 0.16, d - Math.min(w, d) * 0.16, THIN),
  table: (x, y, w, d, f) => {
    const m = Math.min(w, d) * 0.07;
    return rrect(x, y, w, d, Math.min(w, d) * 0.04, out(f)) + rrect(x + m, y + m, w - 2 * m, d - 2 * m, Math.min(w, d) * 0.03, THIN);
  },
  // тумба с ящиками справа, сторона преподавателя — y + d
  teacher: (x, y, w, d, f) => R(x, y, w, d, `fill="${f}" ${K} stroke-width="0.35"`) + R(x + w * 0.72, y, w * 0.28, d, THIN) +
    [1, 2].map(k => Ln(x + w * 0.72, y + d * k / 3, x + w, y + d * k / 3, `${K} stroke-width="0.12"`)).join(''),
  // сиденье и спинка
  chair: (x, y, w, d, f, k) => {
    const m = Math.min(w, d);
    return rrect(x + w * 0.04, y + d * 0.12, w * 0.92, d * 0.86, m * 0.14, out(f, k).replace('0.3', '0.2')) +
      rrect(x, y, w, d * 0.2, m * 0.08, `fill="${f}" stroke="${k}" stroke-width="0.3"`);
  },
  // шкаф: диагональ (условный знак шкафа) и двустворчатые дверцы
  cabinet: (x, y, w, d, f) => R(x, y, w, d, out(f)) + Ln(x, y, x + w, y + d * 0.86, `${K} stroke-width="0.12"`) + front(x, y, w, d, 2),

  /* квартира (формат 3) */
  // изголовье, подушки, одеяло с отогнутым уголком
  bed: (x, y, w, d, f) => {
    const n = w > d * 0.6 ? 2 : 1, m = Math.min(w, d), g = w * 0.06, pw = (w - g * (n + 1)) / n;
    let s = rrect(x, y, w, d, m * 0.03, out(f)) + R(x, y, w, d * 0.05, `fill="#111" ${K} stroke-width="0.1"`);
    for (let i = 0; i < n; i++) s += rrect(x + g + i * (pw + g), y + d * 0.09, pw, d * 0.15, m * 0.06, thin('#111', '#fff'));
    const by = y + d * 0.3;
    s += rrect(x + w * 0.02, by, w * 0.96, d * 0.68, m * 0.03, thin('#111', f));
    // уголок одеяла отогнут — виден белый край
    s += poly([x + w * 0.6, by, x + w * 0.98, by, x + w * 0.98, by + d * 0.2], `fill="#fff" ${K} stroke-width="0.12"`);
    s += poly([x + w * 0.6, by, x + w * 0.98, by + d * 0.2, x + w * 0.7, by + d * 0.15], `fill="${f}" ${K} stroke-width="0.15"`);
    return s;
  },
  // спинка, подлокотники, две-четыре подушки
  sofa: (x, y, w, d, f, k) => {
    const aw = Math.min(w * 0.11, d * 0.22);
    return upholstered(x, y, w, d, f, k, aw, Math.max(1, Math.min(4, Math.round((w - 2 * aw) / (d * 0.62)))));
  },
  fridge: (x, y, w, d, f) => R(x, y, w, d, out(f)) + front(x, y, w, d, 1) +
    T(x + w / 2, y + d * 0.43, 'Х', { size: Math.min(w, d) * 0.5, anchor: 'middle', base: 'central', weight: 700 }),
  // четыре конфорки и ручки
  stove: (x, y, w, d, f) => R(x, y, w, d, out(f)) +
    [[0.3, 0.3], [0.7, 0.3], [0.3, 0.68], [0.7, 0.68]].map(([kx, ky]) => circle(x + w * kx!, y + d * ky!, Math.min(w, d) * 0.13, THIN) + circle(x + w * kx!, y + d * ky!, Math.min(w, d) * 0.06, THIN)).join('') +
    [0.2, 0.4, 0.6, 0.8].map(kx => circle(x + w * kx, y + d * 0.93, Math.min(w, d) * 0.03, `fill="#111" ${K} stroke-width="0.05"`)).join(''),
  // чаша и слив
  bath: (x, y, w, d, f) => {
    const m = Math.min(w, d) * 0.12;
    return R(x, y, w, d, out(f)) + rrect(x + m, y + m, w - 2 * m, d - 2 * m, Math.min(w, d) * 0.3, THIN) +
      circle(x + w / 2, y + m * 2.2, Math.min(w, d) * 0.05, THIN);
  },
  // чаша и кран у стены
  sink: (x, y, w, d, f) => R(x, y, w, d, out(f)) + ellipse(x + w / 2, y + d * 0.58, w * 0.36, d * 0.32, THIN) +
    circle(x + w / 2, y + d * 0.13, Math.min(w, d) * 0.06, `fill="#111" ${K} stroke-width="0.1"`),
  // бачок у стены, чаша и сиденье
  toilet: (x, y, w, d, f) => rrect(x + w * 0.05, y, w * 0.9, d * 0.28, Math.min(w, d) * 0.05, out(f)) +
    ellipse(x + w / 2, y + d * 0.62, w * 0.42, d * 0.36, out(f)) + ellipse(x + w / 2, y + d * 0.65, w * 0.26, d * 0.24, THIN),
  // залита, как стена
  column: (x, y, w, d) => R(x, y, w, d, `fill="#111" ${K} stroke-width="0.3"`),

  /* формат 8 (этап 11) */
  // как диван, одна подушка, подлокотники шире
  armchair: (x, y, w, d, f, k) => upholstered(x, y, w, d, f, k, w * 0.18, 1),
  // ящик с ручкой
  nightstand: (x, y, w, d, f) => R(x, y, w, d, out(f)) + front(x, y, w, d, 1),
  // ящики с ручками у лицевой стороны
  dresser: (x, y, w, d, f) => R(x, y, w, d, out(f)) + front(x, y, w, d, 3),
  // полки вдоль
  shelf: (x, y, w, d, f) => R(x, y, w, d, out(f)) +
    [1, 2, 3].map(k => Ln(x + w * k / 4, y, x + w * k / 4, y + d, `${K} stroke-width="0.12"`)).join(''),
  // как шкаф, двери-купе внахлёст у лицевой стороны
  wardrobe: (x, y, w, d, f) => R(x, y, w, d, out(f)) + Ln(x, y, x + w, y + d, `${K} stroke-width="0.15"`) +
    Ln(x + w * 0.04, y + d * 0.8, x + w * 0.56, y + d * 0.8, `${K} stroke-width="0.25"`) +
    Ln(x + w * 0.44, y + d * 0.9, x + w * 0.96, y + d * 0.9, `${K} stroke-width="0.25"`),
  // тумба с ящиками сбоку
  writingDesk: (x, y, w, d, f) => R(x, y, w, d, out(f)) + R(x + w * 0.7, y, w * 0.3, d, THIN) +
    [1, 2].map(k => Ln(x + w * 0.7, y + d * k / 3, x + w, y + d * k / 3, `${K} stroke-width="0.12"`)).join(''),
  // плоский экран и подставка перед ним
  tv: (x, y, w, d) => R(x, y, w, d * 0.4, `fill="#111" ${K} stroke-width="0.2"`) +
    poly([x + w * 0.38, y + d * 0.4, x + w * 0.62, y + d * 0.4, x + w * 0.7, y + d, x + w * 0.3, y + d], `fill="#fff" ${K} stroke-width="0.15"`),
  // монитор у стены, клавиатура и мышь перед ним
  computer: (x, y, w, d, f) => R(x + w * 0.15, y, w * 0.7, d * 0.12, `fill="#111" ${K} stroke-width="0.15"`) +
    R(x + w * 0.42, y + d * 0.12, w * 0.16, d * 0.14, THIN) +
    R(x + w * 0.12, y + d * 0.5, w * 0.6, d * 0.26, out(f).replace('0.3', '0.18')) +
    [1, 2].map(k => Ln(x + w * 0.12, y + d * (0.5 + 0.26 * k / 3), x + w * 0.72, y + d * (0.5 + 0.26 * k / 3), `${K} stroke-width="0.08"`)).join('') +
    ellipse(x + w * 0.84, y + d * 0.63, w * 0.05, d * 0.09, THIN),
  // пунктирный контур с бахромой по коротким сторонам
  carpet: (x, y, w, d) => R(x, y, w, d, `fill="none" ${K} stroke-width="0.2" stroke-dasharray="1.2 0.6"`) +
    R(x + Math.min(w, d) * 0.1, y + Math.min(w, d) * 0.1, w - Math.min(w, d) * 0.2, d - Math.min(w, d) * 0.2, `fill="none" ${K} stroke-width="0.12"`),
  // тонкая полоса со штрихами отражения
  mirror: (x, y, w, d) => R(x, y, w, d, `fill="#EAF1F5" ${K} stroke-width="0.2"`) +
    Ln(x + w * 0.3, y, x + w * 0.4, y + d, `${K} stroke-width="0.1"`) + Ln(x + w * 0.55, y, x + w * 0.65, y + d, `${K} stroke-width="0.1"`),
  // барабан
  washer: (x, y, w, d, f) => R(x, y, w, d, out(f)) + circle(x + w / 2, y + d / 2, Math.min(w, d) * 0.33, THIN) +
    circle(x + w / 2, y + d / 2, Math.min(w, d) * 0.18, THIN),
  // поддон с диагоналями и слив
  shower: (x, y, w, d, f) => R(x, y, w, d, out(f)) + Ln(x, y, x + w, y + d, `${K} stroke-width="0.12"`) +
    Ln(x + w, y, x, y + d, `${K} stroke-width="0.12"`) + circle(x + w / 2, y + d / 2, Math.min(w, d) * 0.07, `fill="#fff" ${K} stroke-width="0.15"`),
  safe: (x, y, w, d) => R(x, y, w, d, `fill="#DDD" ${K} stroke-width="0.35"`) +
    T(x + w / 2, y + d / 2, 'С', { size: Math.min(w, d) * 0.55, anchor: 'middle', base: 'central', weight: 700 }),
  // контур тела: голова у стороны y, руки вдоль тела, ноги; линия — штриховая, как обвод на месте
  body: (x, y, w, d) => {
    const cx = x + w / 2, hr = Math.min(w * 0.2, d * 0.07), a = `fill="none" ${K} stroke-width="0.3" stroke-dasharray="1 0.5"`;
    const sh = y + hr * 2.3, hip = y + d * 0.55, foot = y + d;
    const torso = `M${cx - w * 0.28} ${sh} L${cx + w * 0.28} ${sh} L${cx + w * 0.2} ${hip} L${cx - w * 0.2} ${hip} Z`;
    const arms = `M${cx - w * 0.28} ${sh} L${x} ${y + d * 0.5} M${cx + w * 0.28} ${sh} L${x + w} ${y + d * 0.5}`;
    const legs = `M${cx - w * 0.12} ${hip} L${cx - w * 0.25} ${foot} M${cx + w * 0.12} ${hip} L${cx + w * 0.25} ${foot}`;
    return circle(cx, y + hr, hr, a) + `<path d="${torso} ${arms} ${legs}" ${a}/>`;
  },
};

/** Виды, у которых знак в легенде свой, а не общий: стол и парта — одной строкой «Стол», стул — синим контуром */
export const SYMBOL_TYPES = (Object.keys(SYMBOLS) as ItemType[]).filter(t => !['desk', 'table', 'teacher', 'chair', 'cabinet'].includes(t));

/** Знак предмета; null — у этого вида свой рисунок в sheet.ts (проектор, кафедра, «другое»). k — цвет линии */
export function itemSymbol(type: ItemType, x: number, y: number, w: number, d: number, fill = '#fff', k = '#111'): string | null {
  const draw = SYMBOLS[type];
  return draw ? draw(x, y, w, d, fill, k) : null;
}

/** Размер знака в легенде: пропорции похожи на настоящий предмет, по ширине не больше 10 мм */
export const LEGEND_BOX: Partial<Record<ItemType, [number, number]>> = {
  desk: [8, 3], table: [8, 3], teacher: [8, 3], chair: [2.8, 2.8], cabinet: [8, 3],
  bed: [3.2, 4], sofa: [7, 3.2], fridge: [3.2, 3.4], stove: [3.4, 3.4], bath: [8, 3.4],
  sink: [3.6, 3.2], toilet: [2.6, 4], column: [2.6, 2.6],
  armchair: [3.6, 3.6], nightstand: [3, 2.8], dresser: [6, 3], shelf: [6, 2.6], wardrobe: [8, 3],
  writingDesk: [7, 3.4], tv: [7, 1.6], computer: [4.4, 3.6], carpet: [7, 4], mirror: [7, 1],
  washer: [3.4, 3.4], shower: [3.6, 3.6], safe: [3, 3], body: [2.4, 7],
};

/** Светильник — круг с крестом (условный знак); dashed — потолка на листе нет, рисуется на полу пунктиром */
export function lampSymbol(cx: number, cy: number, r: number, dashed = false): string {
  const k = r * Math.SQRT1_2, a = `${K} stroke-width="0.15"`;
  return circle(cx, cy, r, `fill="#fff" ${K} stroke-width="0.3"${dashed ? ' stroke-dasharray="1 0.6"' : ''}`) +
    Ln(cx - k, cy - k, cx + k, cy + k, a) + Ln(cx + k, cy - k, cx - k, cy + k, a);
}
