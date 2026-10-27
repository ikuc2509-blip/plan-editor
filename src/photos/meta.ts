// Сведения о снимке: SHA-256 оригинала, время съёмки и координаты из EXIF, имя в photos/.
// Без DOM: работает и в тестах. Сам файл здесь не меняется — только читается.
import type { Photo } from '../model/types';

/** SHA-256 в виде hex — встроенный Web Crypto, без сети */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface ExifInfo {
  /** «2026-10-22T10:15:00» — местное время камеры; '' — нет */
  takenAt: string;
  hasGps: boolean;
}

/** «2026:10:22 10:15:00» → «2026-10-22T10:15:00» */
export function exifDate(v: unknown): string {
  const m = typeof v === 'string' ? /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : '';
}

/** Время съёмки и наличие координат; файл без EXIF или не снимок — пустые сведения, без ошибки */
export async function readExif(bytes: Uint8Array): Promise<ExifInfo> {
  try {
    // библиотека грузится только при добавлении снимков
    const exifr = (await import('exifr')).default;
    const t = await exifr.parse(bytes, {
      tiff: true, exif: true, gps: true, ifd1: false, interop: false,
      xmp: false, icc: false, iptc: false, jfif: false, ihdr: false,
      reviveValues: false, sanitize: true, mergeOutput: true,
    }) as Record<string, unknown> | undefined;
    if (!t) return { takenAt: '', hasGps: false };
    return {
      takenAt: exifDate(t.DateTimeOriginal) || exifDate(t.CreateDate) || exifDate(t.DateTime),
      hasGps: t.GPSLatitude !== undefined || t.latitude !== undefined,
    };
  } catch {
    return { takenAt: '', hasGps: false };
  }
}

/**
 * Имя в photos/: латиница, цифры, «._-» (архиваторы и флешки не спотыкаются),
 * без повторов — к повтору добавляется «_2», «_3».
 */
export function uniqueFileName(name: string, taken: ReadonlySet<string>): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'photo';
  const make = (k: number) => base + (k > 1 ? '_' + k : '') + (ext ? '.' + ext : '');
  let k = 1;
  while (taken.has(make(k).toLowerCase())) k++;
  return make(k);
}

export interface NewPhoto {
  bytes: Uint8Array;
  name: string;
  type: string;
  source: Photo['source'];
  /** для снимка камеры: момент съёмки (EXIF у него нет) */
  takenAt?: string;
}

/** Сведения о новом снимке; номер, вид и привязку задаёт вызывающий */
export async function describePhoto(
  f: NewPhoto, id: string, n: string, taken: ReadonlySet<string>, extra: Pick<Photo, 'kind' | 'link' | 'shot'>,
): Promise<Photo> {
  const [sha256, exif] = await Promise.all([sha256Hex(f.bytes), readExif(f.bytes)]);
  return {
    id, n, file: uniqueFileName(f.name, taken), name: f.name, type: f.type || 'application/octet-stream',
    size: f.bytes.length, sha256, ...extra,
    takenAt: exif.takenAt || f.takenAt || '', hasGps: exif.hasGps,
    addedAt: new Date().toISOString(), source: f.source, caption: '',
  };
}

export interface PhotoCheck {
  /** номера снимков, файлов которых нет */
  missing: string[];
  /** номера снимков, у которых отпечаток не совпал */
  changed: string[];
}

/** Проверка при открытии файла: все ли снимки на месте и не изменились ли они */
export async function checkPhotos(photos: readonly Photo[], files: Readonly<Record<string, Uint8Array>>): Promise<PhotoCheck> {
  const r: PhotoCheck = { missing: [], changed: [] };
  for (const ph of photos) {
    const b = files[ph.file];
    if (!b) r.missing.push(ph.n);
    else if (ph.sha256 && (await sha256Hex(b)) !== ph.sha256) r.changed.push(ph.n);
  }
  return r;
}

/** «84 МБ», «850 КБ» */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 ** 3).toFixed(1).replace('.', ',') + ' ГБ';
  if (bytes >= 1024 * 1024) return Math.round(bytes / 1024 ** 2) + ' МБ';
  return Math.max(1, Math.round(bytes / 1024)) + ' КБ';
}

/** «2026-10-22T10:15:00» → «22.10.2026 10:15» */
export function showTaken(t: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : '';
}

/** Порог предупреждения о весе проекта (decisions.md) */
export const BIG_PROJECT = 500 * 1024 * 1024;
