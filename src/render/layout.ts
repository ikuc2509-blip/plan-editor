// Раскладка листа: где рамка, чертёж, легенда и штамп. Размеры — мм листа.
// Текст одного размера на A3 и A4 (decisions.md): на A4 уже колонка легенды
// и меньше место под чертёж.
import type { Paper } from '../model/types';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  paper: Paper;
  /** размер листа, альбомная ориентация */
  w: number;
  h: number;
  /** рамка: слева 20 мм под подшивку, с остальных сторон 5 мм */
  frame: Box;
  /** граница колонки легенды и штампа */
  colX: number;
  /** область чертежа (развёртка вписывается сюда) */
  area: Box;
  /** символов в строке легенды и примечаний */
  legendChars: number;
  notesChars: number;
  /** символов в строке значения штампа и ширина колонки подписей штампа */
  stampChars: number;
  stampLabelW: number;
  /**
   * Где условные знаки (окно, дверь, стол…): не задано — в колонке справа под метками;
   * задано — отдельным блоком в несколько колонок под чертежом (на A4 в колонке не хватает места).
   */
  symbols?: Box & { cols: number; chars: number };
  /** стрелка севера */
  north: { x: number; y: number };
}

const A3: Layout = {
  paper: 'A3', w: 420, h: 297,
  frame: { x: 20, y: 5, w: 395, h: 287 },
  colX: 292,
  area: { x: 24, y: 28, w: 264, h: 256 },
  legendChars: 46, notesChars: 48, stampChars: 36, stampLabelW: 30,
  north: { x: 278, y: 40 },
};

const A4: Layout = {
  paper: 'A4', w: 297, h: 210,
  frame: { x: 20, y: 5, w: 272, h: 200 },
  colX: 204,
  area: { x: 24, y: 28, w: 176, h: 143 },
  legendChars: 40, notesChars: 42, stampChars: 38, stampLabelW: 22,
  symbols: { x: 24, y: 173, w: 176, h: 30, cols: 3, chars: 22 },
  north: { x: 190, y: 40 },
};

export const layoutFor = (paper: Paper): Layout => (paper === 'A4' ? A4 : A3);

export const PAPERS: Record<Paper, string> = { A3: 'A3', A4: 'A4' };
