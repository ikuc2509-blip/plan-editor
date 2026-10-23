// Выпрямление снимка стены (этап 9): копия снимка перерисовывается по гомографии
// в ровный прямоугольник. Оригинал не меняется; готовая картинка в файл не пишется —
// считается заново при открытии (decisions.md).
import { applyH, homography, type Pt2 } from '../geometry/homography';

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Наибольшая сторона рабочей копии снимка и выпрямленной картинки, px */
export const WORK_MAX = 2400;
export const OUT_MAX = 2048;

const UNIT: Pt2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/**
 * Размер выпрямленной картинки: высота — как у кадра на снимке (средняя длина левого и правого края),
 * ширина — по соотношению сторон участка стены (aspect = ширина / высота, м / м).
 */
export function outSize(quad: readonly Pt2[], aspect: number, max = OUT_MAX): { w: number; h: number } {
  const len = (a: Pt2, b: Pt2) => Math.hypot(a.x - b.x, a.y - b.y);
  let h = (len(quad[0]!, quad[3]!) + len(quad[1]!, quad[2]!)) / 2, w = h * aspect;
  const k = Math.min(1, max / Math.max(w, h));
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  return { w, h };
}

/**
 * Перерисовать участок снимка в прямоугольник w × h. quad — углы участка на снимке, px:
 * вверху слева, вверху справа, внизу справа, внизу слева. Вне снимка — прозрачно.
 */
export function warp(src: Raster, quad: readonly Pt2[], w: number, h: number): Raster | null {
  const m = homography(UNIT, quad);
  if (!m) return null;
  const out = new Uint8ClampedArray(w * h * 4);
  const sw = src.width, sh = src.height, s = src.data;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = applyH(m, (i + 0.5) / w, (j + 0.5) / h);
      // середина пикселя источника — в его центре: сдвиг на полпикселя
      const x = p.x - 0.5, y = p.y - 0.5;
      if (x < -0.5 || y < -0.5 || x > sw - 0.5 || y > sh - 0.5) continue;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(x))), y0 = Math.max(0, Math.min(sh - 1, Math.floor(y)));
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
      const o = (j * w + i) * 4;
      const a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, d = (y1 * sw + x1) * 4;
      for (let k = 0; k < 4; k++) {
        const top = s[a + k]! + (s[b + k]! - s[a + k]!) * fx;
        const bot = s[c + k]! + (s[d + k]! - s[c + k]!) * fx;
        out[o + k] = top + (bot - top) * fy;
      }
    }
  }
  return { data: out, width: w, height: h };
}

/* ——— в браузере ——— */

/** Рабочая копия снимка для окна «Выпрямить» и для выпрямления: не больше WORK_MAX по стороне */
export interface WorkImage {
  url: string;
  raster: Raster;
}

const work = new Map<string, Promise<WorkImage | null>>();

/** Рабочая копия из оригинала; null — браузер не умеет открыть этот формат (например, HEIC) */
export function workImage(id: string, original: () => Promise<Blob | null>): Promise<WorkImage | null> {
  let w = work.get(id);
  if (!w) {
    w = (async () => {
      const blob = await original();
      if (!blob) return null;
      try {
        // createImageBitmap сам учитывает поворот из EXIF — как у уменьшенных копий
        const bmp = await createImageBitmap(blob);
        const k = Math.min(1, WORK_MAX / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k));
        c.height = Math.max(1, Math.round(bmp.height * k));
        const ctx = c.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const jpg = await new Promise<Blob | null>(res => c.toBlob(b => res(b), 'image/jpeg', 0.9));
        return jpg ? { url: URL.createObjectURL(jpg), raster: { data: img.data, width: img.width, height: img.height } } : null;
      } catch {
        return null;
      }
    })();
    work.set(id, w);
    // память: держим рабочие копии двух последних снимков
    while (work.size > 2) {
      const [old] = work.keys();
      void work.get(old!)!.then(x => { if (x) URL.revokeObjectURL(x.url); });
      work.delete(old!);
    }
  }
  return w;
}

/** Выпрямленная картинка — адрес blob: (живёт, пока открыта вкладка) */
export async function rectifiedUrl(src: Raster, quadFrac: readonly Pt2[], aspect: number): Promise<string | null> {
  const quad = quadFrac.map(p => ({ x: p.x * src.width, y: p.y * src.height }));
  const { w, h } = outSize(quad, aspect);
  const r = warp(src, quad, w, h);
  if (!r) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  const b = await new Promise<Blob | null>(res => c.toBlob(x => res(x), 'image/jpeg', 0.88));
  return b ? URL.createObjectURL(b) : null;
}
