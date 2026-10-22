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
};
