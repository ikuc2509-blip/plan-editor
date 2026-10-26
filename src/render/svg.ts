// SVG-примитивы листа. Возвращают строки — одинаково для экрана и для файлов.

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Число на листе: два знака, с запятой */
export const fmt = (v: number): string => r2(v).toFixed(2).replace('.', ',');

/** Шрифт листа лежит внутри приложения (src/assets/fonts); остальные — запасные */
export const FONT_NAME = 'PT Sans';
export const FONT = `"${FONT_NAME}", Arial, sans-serif`;

export const R = (x: number, y: number, w: number, h: number, a = ''): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;

export const Ln = (x1: number, y1: number, x2: number, y2: number, a = ''): string =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${a}/>`;

export interface TextOpts {
  size?: number;
  rot?: number;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number;
  fill?: string;
  base?: string;
}

export function T(x: number, y: number, str: string, o: TextOpts = {}): string {
  const sz = o.size || 2.6;
  const rot = o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : '';
  // центр по высоте считаем сами: dominant-baseline не понимает svg2pdf, и в PDF текст съезжал бы
  const ty = o.base === 'central' ? y + sz * 0.35 : y;
  return `<text x="${x}" y="${ty}" font-family='${FONT}' font-size="${sz}" text-anchor="${o.anchor || 'start'}" font-weight="${o.weight || 400}" fill="${o.fill || '#111'}"${rot}>${esc(str)}</text>`;
}

/** Перенос строки по словам, max — символов в строке */
export function wrap(str: string, max: number): string[] {
  // «№» не отрываем от номера
  const words = String(str).split(/\s+/).reduce<string[]>((acc, w) => {
    if (acc.length && acc[acc.length - 1] === '№') acc[acc.length - 1] += ' ' + w; else acc.push(w);
    return acc;
  }, []);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

/** Кружок метки с номером: как в образце — белый, контур и номер красные (чёрно-белый лист — чёрные) */
export function marker(x: number, y: number, n: string, r = 2.8, line = '#C0392B'): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${line}" stroke-width="0.42"/>` +
    T(x, y + 0.05, n, { size: r * 1.05, anchor: 'middle', weight: 700, base: 'central', fill: line });
}
