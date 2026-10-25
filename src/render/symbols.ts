// Условные знаки предметов квартиры (decisions.md, этап 5): одни и те же для плана и легенды.
// Прямоугольник x, y, w, d — в мм листа, до поворота; «верх» знака — сторона y.
import type { ItemType } from '../model/types';
import { Ln, R, T } from './svg';

const K = 'stroke="#111"';
const OUT = `fill="#fff" ${K} stroke-width="0.3"`;
const THIN = `fill="none" ${K} stroke-width="0.15"`;

const ellipse = (cx: number, cy: number, rx: number, ry: number, a: string) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${a}/>`;
const circle = (cx: number, cy: number, r: number, a: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${a}/>`;
const rrect = (x: number, y: number, w: number, h: number, r: number, a: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${a}/>`;

type Draw = (x: number, y: number, w: number, d: number) => string;

const SYMBOLS: Partial<Record<ItemType, Draw>> = {
  // подушка у изголовья, край одеяла
  bed: (x, y, w, d) => R(x, y, w, d, OUT) +
    rrect(x + w * 0.1, y + d * 0.05, w * 0.8, d * 0.15, Math.min(w, d) * 0.04, THIN) +
    Ln(x, y + d * 0.3, x + w, y + d * 0.3, `${K} stroke-width="0.15"`),
  // спинка и подлокотники
  sofa: (x, y, w, d) => R(x, y, w, d, OUT) +
    R(x, y, w, d * 0.25, THIN) + R(x, y, w * 0.1, d, THIN) + R(x + w * 0.9, y, w * 0.1, d, THIN),
  fridge: (x, y, w, d) => R(x, y, w, d, OUT) +
    T(x + w / 2, y + d / 2, 'Х', { size: Math.min(w, d) * 0.55, anchor: 'middle', base: 'central', weight: 700 }),
  // четыре конфорки
  stove: (x, y, w, d) => R(x, y, w, d, OUT) +
    [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].map(([kx, ky]) => circle(x + w * kx!, y + d * ky!, Math.min(w, d) * 0.14, THIN)).join(''),
  // чаша и слив
  bath: (x, y, w, d) => {
    const m = Math.min(w, d) * 0.12;
    return R(x, y, w, d, OUT) + rrect(x + m, y + m, w - 2 * m, d - 2 * m, Math.min(w, d) * 0.3, THIN) +
      circle(x + w / 2, y + m * 2.2, Math.min(w, d) * 0.05, THIN);
  },
  // чаша и кран у стены
  sink: (x, y, w, d) => R(x, y, w, d, OUT) + ellipse(x + w / 2, y + d * 0.58, w * 0.36, d * 0.32, THIN) +
    circle(x + w / 2, y + d * 0.13, Math.min(w, d) * 0.06, `fill="#111" ${K} stroke-width="0.1"`),
  // бачок у стены и чаша
  toilet: (x, y, w, d) => R(x + w * 0.05, y, w * 0.9, d * 0.28, OUT) +
    ellipse(x + w / 2, y + d * 0.62, w * 0.42, d * 0.36, OUT),
  // залита, как стена
  column: (x, y, w, d) => R(x, y, w, d, `fill="#111" ${K} stroke-width="0.3"`),

  /* формат 8 (этап 11) */
  // спинка и подлокотники, как у дивана
  armchair: (x, y, w, d) => R(x, y, w, d, OUT) +
    R(x, y, w, d * 0.25, THIN) + R(x, y, w * 0.18, d, THIN) + R(x + w * 0.82, y, w * 0.18, d, THIN),
  // ящик посередине
  nightstand: (x, y, w, d) => R(x, y, w, d, OUT) + Ln(x, y + d / 2, x + w, y + d / 2, `${K} stroke-width="0.15"`),
  // ящики — полосы поперёк
  dresser: (x, y, w, d) => R(x, y, w, d, OUT) +
    [1, 2].map(k => Ln(x + w * k / 3, y, x + w * k / 3, y + d, `${K} stroke-width="0.15"`)).join(''),
  // полки вдоль
  shelf: (x, y, w, d) => R(x, y, w, d, OUT) +
    [1, 2, 3].map(k => Ln(x + w * k / 4, y, x + w * k / 4, y + d, `${K} stroke-width="0.12"`)).join(''),
  // как шкаф, двери-купе внахлёст у лицевой стороны
  wardrobe: (x, y, w, d) => R(x, y, w, d, OUT) + Ln(x, y, x + w, y + d, `${K} stroke-width="0.15"`) +
    Ln(x + w * 0.04, y + d * 0.8, x + w * 0.56, y + d * 0.8, `${K} stroke-width="0.25"`) +
    Ln(x + w * 0.44, y + d * 0.9, x + w * 0.96, y + d * 0.9, `${K} stroke-width="0.25"`),
  // тумба с ящиками сбоку
  writingDesk: (x, y, w, d) => R(x, y, w, d, OUT) + R(x + w * 0.7, y, w * 0.3, d, THIN),
  // плоский экран — чёрная полоса
  tv: (x, y, w, d) => R(x, y, w, d, `fill="#111" ${K} stroke-width="0.2"`),
  // монитор у стены, клавиатура перед ним
  computer: (x, y, w, d) => R(x + w * 0.1, y, w * 0.8, d * 0.3, OUT) + R(x + w * 0.15, y + d * 0.55, w * 0.7, d * 0.25, THIN),
  // пунктирный контур с бахромой по коротким сторонам
  carpet: (x, y, w, d) => R(x, y, w, d, `fill="none" ${K} stroke-width="0.2" stroke-dasharray="1.2 0.6"`) +
    R(x + Math.min(w, d) * 0.1, y + Math.min(w, d) * 0.1, w - Math.min(w, d) * 0.2, d - Math.min(w, d) * 0.2, `fill="none" ${K} stroke-width="0.12"`),
  // тонкая полоса со штрихами отражения
  mirror: (x, y, w, d) => R(x, y, w, d, `fill="#EAF1F5" ${K} stroke-width="0.2"`) +
    Ln(x + w * 0.3, y, x + w * 0.4, y + d, `${K} stroke-width="0.1"`) + Ln(x + w * 0.55, y, x + w * 0.65, y + d, `${K} stroke-width="0.1"`),
  // барабан
  washer: (x, y, w, d) => R(x, y, w, d, OUT) + circle(x + w / 2, y + d / 2, Math.min(w, d) * 0.33, THIN) +
    circle(x + w / 2, y + d / 2, Math.min(w, d) * 0.18, THIN),
  // поддон с диагоналями и слив
  shower: (x, y, w, d) => R(x, y, w, d, OUT) + Ln(x, y, x + w, y + d, `${K} stroke-width="0.12"`) +
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

export const SYMBOL_TYPES = Object.keys(SYMBOLS) as ItemType[];

/** Знак предмета квартиры; null — у этого вида свой рисунок в sheet.ts */
export function itemSymbol(type: ItemType, x: number, y: number, w: number, d: number): string | null {
  const f = SYMBOLS[type];
  return f ? f(x, y, w, d) : null;
}

/** Размер знака в легенде: пропорции похожи на настоящий предмет, по ширине не больше 10 мм */
export const LEGEND_BOX: Partial<Record<ItemType, [number, number]>> = {
  bed: [3.2, 4], sofa: [7, 3.2], fridge: [3.2, 3.4], stove: [3.4, 3.4], bath: [8, 3.4],
  sink: [3.6, 3.2], toilet: [2.6, 4], column: [2.6, 2.6],
  armchair: [3.6, 3.6], nightstand: [3, 2.8], dresser: [6, 3], shelf: [6, 2.6], wardrobe: [8, 3],
  writingDesk: [7, 3.4], tv: [7, 1.6], computer: [4.4, 3.6], carpet: [7, 4], mirror: [7, 1],
  washer: [3.4, 3.4], shower: [3.6, 3.6], safe: [3, 3], body: [2.4, 7],
};
