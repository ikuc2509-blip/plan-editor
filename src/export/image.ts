// Лист в SVG и PNG — со встроенным шрифтом, чтобы выглядел одинаково на любом компьютере.
import type { Plan } from '../model/types';
import { sheetLayout, sheetSvg } from '../render/sheet';
import { fontCss } from './font';

/** SVG-файл листа */
export async function sheetSvgFile(plan: Plan): Promise<string> {
  return sheetSvg(plan, { fontCss: await fontCss() });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось отрисовать лист'));
    img.src = src;
  });
}

/** PNG листа для вставки в Word; 300 точек на дюйм — для печати */
export async function sheetPng(plan: Plan, dpi = 300): Promise<Blob> {
  const lay = sheetLayout(plan);
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await sheetSvgFile(plan)));
  const W = Math.round(lay.w / 25.4 * dpi), H = Math.round(lay.h / 25.4 * dpi);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) throw new Error('Браузер не дал нарисовать лист');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  x.drawImage(img, 0, 0, W, H);
  return new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('Не удалось сохранить PNG'))), 'image/png'));
}
