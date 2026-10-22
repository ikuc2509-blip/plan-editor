// SVG-примитивы листа. Возвращают строки — одинаково для экрана и для файлов.

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Число на листе: два знака, с запятой */
export const fmt = (v: number): string => r2(v).toFixed(2).replace('.', ',');

export const FONT = 'Arial, "Liberation Sans", Helvetica, sans-serif';

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
  return `<text x="${x}" y="${y}" font-family='${FONT}' font-size="${sz}" text-anchor="${o.anchor || 'start'}" font-weight="${o.weight || 400}" fill="${o.fill || '#111'}" dominant-baseline="${o.base || 'auto'}"${rot}>${esc(str)}</text>`;
}

/** Перенос строки по словам, max — символов в строке */
export function wrap(str: string, max: number): string[] {
  const words = String(str).split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

/** Жёлтый кружок метки с номером */
export function marker(x: number, y: number, n: string, r = 2.8): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#F2C200" stroke="#111" stroke-width="0.35"/>` +
    T(x, y + 0.05, n, { size: r * 1.05, anchor: 'middle', weight: 700, base: 'central' });
}
