// Список файлов версии для работы без сети. Общий для сборки (vite.config.ts) и
// service worker'а, поэтому без DOM и без Node.

/** Файл со списком; лежит рядом с index.html и всегда берётся из сети */
export const LIST_FILE = 'app-files.json';
/** Хранилища браузера (Cache Storage) с файлами версий: omp-app-<сборка> */
export const CACHE_PREFIX = 'omp-app-';

export interface AppFiles {
  /** версия из package.json — для показа пользователю */
  version: string;
  /** отпечаток сборки: меняется при любом изменении файлов */
  build: string;
  /** пути относительно адреса приложения */
  files: string[];
  /** отпечаток index.html — проверка, что скачана страница той же сборки */
  indexHash: string;
}

/** Файлы из public/, которые нужны без сети (сборка их не видит в списке модулей) */
export const PUBLIC_FILES = [
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];

/** Короткий отпечаток строки (FNV-1a, 32 бита). Не защита — только «изменилось или нет». */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Список для сборки: файлы из сборки + public/, без карт исходников и самого service worker'а */
export function makeAppFiles(version: string, bundleFiles: string[], indexHtml: string): AppFiles {
  const files = [...new Set([...bundleFiles, ...PUBLIC_FILES])]
    .filter(f => f !== 'sw.js' && f !== LIST_FILE && !f.endsWith('.map'))
    .sort();
  const indexHash = fingerprint(indexHtml);
  return { version, build: fingerprint(version + '\n' + files.join('\n') + '\n' + indexHash), files, indexHash };
}

export const cacheName = (build: string): string => CACHE_PREFIX + build;

/**
 * Какой файл версии отдать на запрос. path — путь относительно адреса приложения, без «?…».
 * Открытие страницы (navigate) — всегда index.html. null — не наш файл, пусть идёт в сеть.
 */
export function cacheKeyFor(path: string, navigate: boolean, files: readonly string[]): string | null {
  if (navigate || path === '') return 'index.html';
  return files.includes(path) ? path : null;
}

/** Старые хранилища версий, которые можно удалить */
export function staleCaches(names: readonly string[], keep: readonly (string | null)[]): string[] {
  const k = new Set(keep.filter((b): b is string => !!b).map(cacheName));
  return names.filter(n => n.startsWith(CACHE_PREFIX) && !k.has(n));
}
