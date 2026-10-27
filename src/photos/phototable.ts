// Фототаблица: подписи снимков и раскладка по листам A4 (без DOM). Сам PDF — export/phototable.ts.
import type { Photo, Plan } from '../model/types';
import { findWall } from '../model/room';
import { shotList } from './shots';

const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Черновик подписи по виду съёмки и привязке; пусто — сказать нечего */
export function captionDraft(p: Plan, ph: Photo): string {
  if (ph.link.kind === 'marker') {
    const id = ph.link.markerId;
    const m = p.markers.find(k => k.id === id);
    const what = m ? `метка № ${m.n}${m.desc.trim() ? ' — ' + m.desc.trim() : ''}` : 'метка';
    return cap(ph.kind === 'detail' ? `${what}, крупный план` : ph.kind === 'nodal' ? `${what}, вид с окружающей обстановкой` : what);
  }
  if (ph.link.kind === 'wall') {
    const w = findWall(p.room, ph.link.wallId);
    return `Стена ${w?.letter ?? '?'}${w?.name ? ` (${w.name})` : ''}${ph.kind === 'overview' ? ', общий вид' : ''}`;
  }
  if (ph.kind === 'orienting') return `Ориентирующий снимок${p.stamp.object.trim() ? ': ' + p.stamp.object.trim() : ''}`;
  if (ph.kind === 'overview') {
    // «Обзорная из угла А/Б» из списка съёмки → «Общий вид помещения из угла А/Б»
    const item = shotList(p).find(s => s.key === ph.shot);
    return 'Общий вид помещения' + (item ? item.title.replace(/^Обзорная/, '') : '');
  }
  if (ph.kind === 'nodal') return 'Узловой снимок';
  if (ph.kind === 'detail') return 'Детальный снимок';
  return '';
}

/** Подпись под снимком: «Фото № 3. …» — своя или черновик, с точкой в конце */
export function photoCaption(p: Plan, ph: Photo): string {
  const t = (ph.caption.trim() || captionDraft(p, ph)).trim();
  const head = `Фото № ${ph.n.trim() || '?'}.`;
  if (!t) return head;
  return `${head} ${t}${/[.!?…]$/.test(t) ? '' : '.'}`;
}

/** Снимки по номерам, как их задал пользователь: «2» раньше «10» */
export const phototableOrder = (photos: readonly Photo[]): Photo[] =>
  [...photos].sort((a, b) => a.n.localeCompare(b.n, 'ru', { numeric: true }) || a.addedAt.localeCompare(b.addedAt));

/* ——— раскладка, мм ——— */

/** Лист A4: поля как в образце фототаблицы — слева 3 см под подшивку, справа 1 см */
export const PAGE = { w: 210, h: 297, left: 30, right: 200, top: 20, bottom: 272 } as const;
/** широкий снимок — по центру листа; два на лист друг под другом */
const WIDE = { w: 150, h: 88 };
/** крупный план или вертикальный — по два рядом */
const SMALL = { w: 80, h: 88 };
const COL_GAP = 10, ROW_GAP = 7, CAP_GAP = 3;
export const CAP_LINE = 4.8;

export interface TableBox {
  id: string;
  /** размер картинки в пикселях (уже с поворотом); 0 — картинки нет, рисуется рамка */
  w: number;
  h: number;
  small: boolean;
  caption: string;
}

export interface Slot {
  id: string;
  /** картинка */
  x: number;
  y: number;
  w: number;
  h: number;
  /** подпись: середина строки по X, первая строка, строки */
  capX: number;
  capY: number;
  lines: string[];
}

/** Вертикальный снимок и крупный план — «маленькие», идут по два в ряд */
export const isSmall = (w: number, h: number, kind: Photo['kind']): boolean => kind === 'detail' || h > w * 1.05;

function fit(w: number, h: number, box: { w: number; h: number }): { w: number; h: number } {
  if (!w || !h) return { w: box.w, h: box.h * 0.75 };
  const k = Math.min(box.w / w, box.h / h);
  return { w: w * k, h: h * k };
}

/**
 * Снимки по листам: ряд — один широкий или два маленьких рядом; не влез — на следующий лист.
 * firstTop — где кончается шапка первого листа; split — перенос подписи по ширине (мм).
 */
export function layoutPhototable(boxes: readonly TableBox[], firstTop: number, split: (text: string, width: number) => string[]): Slot[][] {
  const rows: TableBox[][] = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!, nx = boxes[i + 1];
    if (b.small && nx?.small) { rows.push([b, nx]); i++; } else rows.push([b]);
  }
  const pages: Slot[][] = [[]];
  let y = firstTop;
  for (const row of rows) {
    const width = PAGE.right - PAGE.left;
    const pair = row.length === 2;
    const slots = row.map((b, k): Slot => {
      const box = b.small ? SMALL : WIDE;
      const s = fit(b.w, b.h, box);
      const colW = pair ? (width - COL_GAP) / 2 : width;
      const cx = PAGE.left + (pair ? colW / 2 + k * (colW + COL_GAP) : width / 2);
      const capW = pair ? colW : b.small ? SMALL.w + 20 : WIDE.w;
      return { id: b.id, x: cx - s.w / 2, y: 0, w: s.w, h: s.h, capX: cx, capY: 0, lines: split(b.caption, capW) };
    });
    const imgH = Math.max(...slots.map(s => s.h));
    const rowH = imgH + CAP_GAP + Math.max(...slots.map(s => s.lines.length)) * CAP_LINE;
    if (y + rowH > PAGE.bottom && pages[pages.length - 1]!.length) {
      pages.push([]);
      y = PAGE.top;
    }
    for (const s of slots) {
      // картинки ряда — по нижнему краю, подписи на одной высоте
      s.y = y + (imgH - s.h);
      s.capY = y + imgH + CAP_GAP + CAP_LINE * 0.8;
      pages[pages.length - 1]!.push(s);
    }
    y += rowH + ROW_GAP;
  }
  return pages;
}

/** «следователь Иванов И. И.» → роль «Следователь» и «Иванов И. И.» для строки подписи */
export function signer(author: string): { role: string; name: string } {
  const a = author.trim();
  const m = /^([а-яё-]+(?:\s+[а-яё-]+)*?)\s+([А-ЯЁ].*)$/u.exec(a);
  if (m) return { role: cap(m[1]!), name: m[2]! };
  return { role: '', name: a };
}
