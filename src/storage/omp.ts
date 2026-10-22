// Файл проекта .omp — обычный ZIP:
//   manifest.json — версия формата, версия приложения, даты, номер сохранения;
//   plan.json     — план (формат см. src/model/types.ts);
//   photos/       — оригиналы снимков без изменений (с этапа 7).
// С паролем: manifest.json открыт (без адреса и имён), а plan.json и photos/ лежат
// внутри зашифрованного блока content.bin (это тоже ZIP, но зашифрованный).
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { loadPlan } from '../model/migrate';
import type { Plan } from '../model/types';
import { decrypt, encrypt, type CipherParams } from './crypto';

export const OMP_FORMAT = 'plan-editor-omp';
/** Версия устройства архива (не путать с версией plan.json) */
export const OMP_VERSION = 1;

declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export interface Manifest {
  format: typeof OMP_FORMAT;
  version: number;
  /** версия приложения, сохранившего файл */
  app: string;
  /** версия формата plan.json внутри */
  plan: number;
  /** ISO-время */
  created: string;
  modified: string;
  /** номер сохранения — он же в имени файла */
  saveNumber: number;
  /** есть, если файл защищён паролем */
  encrypted?: CipherParams & { file: 'content.bin' };
}

/** Сведения о проекте, которые живут рядом с планом, а не в нём */
export interface ProjectMeta {
  created: string;
  modified: string;
  saveNumber: number;
}

export interface OmpContent {
  plan: Plan;
  meta: ProjectMeta;
  /** имя файла снимка → байты оригинала */
  photos: Record<string, Uint8Array>;
}

export type ReadResult =
  | { ok: true; content: OmpContent; encrypted: boolean; migratedFrom?: string }
  | { ok: false; reason: 'need-password' | 'wrong-password' | 'error'; error: string };

/** Собрать файл .omp; meta уже содержит номер этого сохранения */
export async function writeOmp(c: OmpContent, password?: string): Promise<Uint8Array> {
  const inner: Zippable = { 'plan.json': strToU8(JSON.stringify(c.plan, null, 1)) };
  // снимки кладём без сжатия: они уже сжаты, а байты оригинала не должны меняться
  for (const [name, bytes] of Object.entries(c.photos)) inner['photos/' + name] = [bytes, { level: 0 }];
  const manifest: Manifest = {
    format: OMP_FORMAT, version: OMP_VERSION, app: APP_VERSION, plan: c.plan.version,
    created: c.meta.created, modified: c.meta.modified, saveNumber: c.meta.saveNumber,
  };
  if (!password) {
    return zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest, null, 1)), ...inner }, { level: 6 });
  }
  const sealed = await encrypt(zipSync(inner, { level: 6 }), password);
  manifest.encrypted = { ...sealed.params, file: 'content.bin' };
  return zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest, null, 1)),
    'content.bin': [sealed.data, { level: 0 }],
  });
}

/** Это файл .omp? (ZIP с manifest.json) — по первым байтам */
export const looksLikeZip = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

/** Только manifest.json — чтобы до ввода пароля понять, нужен ли он */
export function readManifest(bytes: Uint8Array): Manifest | null {
  try {
    const files = unzipSync(bytes, { filter: f => f.name === 'manifest.json' });
    const raw = files['manifest.json'];
    if (!raw) return null;
    const m = JSON.parse(strFromU8(raw)) as Manifest;
    return m.format === OMP_FORMAT ? m : null;
  } catch {
    return null;
  }
}

export async function readOmp(bytes: Uint8Array, password?: string): Promise<ReadResult> {
  const fail = (error: string): ReadResult => ({ ok: false, reason: 'error', error });
  const m = readManifest(bytes);
  if (!m) return fail('Это не файл проекта (.omp)');
  if (m.version > OMP_VERSION) return fail('Файл сохранён более новой версией приложения. Обновите приложение.');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
    if (m.encrypted) {
      if (!password) return { ok: false, reason: 'need-password', error: 'Файл защищён паролем' };
      const sealed = files[m.encrypted.file];
      if (!sealed) return fail('Файл проекта повреждён');
      let inner: Uint8Array;
      try {
        inner = await decrypt(sealed, m.encrypted, password);
      } catch {
        return { ok: false, reason: 'wrong-password', error: 'Неверный пароль' };
      }
      files = unzipSync(inner);
    }
  } catch {
    return fail('Файл проекта повреждён');
  }
  const planRaw = files['plan.json'];
  if (!planRaw) return fail('В файле нет плана');
  let raw: unknown;
  try { raw = JSON.parse(strFromU8(planRaw)); } catch { return fail('План в файле повреждён'); }
  const r = loadPlan(raw);
  if (!r.ok) return fail(r.error);
  const photos: Record<string, Uint8Array> = {};
  for (const [name, b] of Object.entries(files)) if (name.startsWith('photos/') && name.length > 7) photos[name.slice(7)] = b;
  const content: OmpContent = { plan: r.plan, meta: { created: m.created, modified: m.modified, saveNumber: m.saveNumber }, photos };
  return { ok: true, content, encrypted: !!m.encrypted, ...(r.migratedFrom ? { migratedFrom: r.migratedFrom } : {}) };
}
