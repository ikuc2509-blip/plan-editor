// Шрифт листа для файлов: берётся из самого приложения, не из интернета.
import regularUrl from '../assets/fonts/PTSans-Regular.ttf?url';
import boldUrl from '../assets/fonts/PTSans-Bold.ttf?url';
import { FONT_NAME } from '../render/svg';

export interface FontFiles {
  /** содержимое .ttf в base64 */
  regular: string;
  bold: string;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  // кусками: на больших файлах fromCharCode(...всё) переполняет стек
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let cache: Promise<FontFiles> | null = null;

export function loadFonts(): Promise<FontFiles> {
  cache ??= Promise.all([regularUrl, boldUrl].map(u => fetch(u).then(r => {
    if (!r.ok) throw new Error('Не удалось загрузить шрифт листа');
    return r.arrayBuffer();
  }))).then(([r, b]) => ({ regular: toBase64(r!), bold: toBase64(b!) }));
  cache.catch(() => { cache = null; });
  return cache;
}

/** @font-face со шрифтом внутри — для файлов SVG и PNG */
export async function fontCss(): Promise<string> {
  const f = await loadFonts();
  const face = (b64: string, weight: number) =>
    `@font-face{font-family:"${FONT_NAME}";font-weight:${weight};src:url(data:font/ttf;base64,${b64}) format("truetype")}`;
  return face(f.regular, 400) + face(f.bold, 700);
}
