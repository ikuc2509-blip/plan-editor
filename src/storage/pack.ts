// Пакет распознавания в браузере (этап 10): скачивание кусков с адреса приложения, сверка
// SHA-256, «Загрузить с диска» и «Сохранить пакет в файл». Хранится в IndexedDB отдельно
// от версий приложения — после обновления не качается заново (decisions.md).
import { Unzip, Zip, ZipPassThrough } from 'fflate';
import { PACK, PART_SIZE, partPath, type PackFile } from '../recognize/packInfo';
import { deletePackParts, getPackPart, packKeys, putPackPart } from './db';

const partKey = (f: PackFile, i: number) => `${PACK.id}/${f.name}/${i}`;
const allParts = (): { f: PackFile; i: number }[] => PACK.files.flatMap(f => f.parts.map((_, i) => ({ f, i })));
const partBytes = (f: PackFile, i: number) => Math.min(PART_SIZE, f.size - i * PART_SIZE);

async function sha256(b: Blob | ArrayBuffer): Promise<string> {
  const buf = b instanceof Blob ? await b.arrayBuffer() : b;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Сколько байт пакета уже в браузере; заодно убирает куски прежних пакетов */
export async function packHave(): Promise<number> {
  const keys = await packKeys();
  const old = keys.filter(k => !k.startsWith(PACK.id + '/'));
  if (old.length) await deletePackParts(old).catch(() => undefined);
  const have = new Set(keys);
  return allParts().reduce((s, { f, i }) => s + (have.has(partKey(f, i)) ? partBytes(f, i) : 0), 0);
}

/**
 * Скачать недостающие куски с адреса приложения. Каждый кусок сверяется с отпечатком
 * из кода приложения до записи; оборвалось — следующий раз докачаются только недостающие.
 */
export async function downloadPack(progress: (done: number) => void, signal?: AbortSignal): Promise<void> {
  const have = new Set(await packKeys());
  let done = await packHave();
  progress(done);
  for (const { f, i } of allParts()) {
    if (have.has(partKey(f, i))) continue;
    const res = await fetch(partPath(f, i), { cache: 'no-store', signal });
    if (res.status === 404) throw new Error('На сайте нет пакета распознавания (он появляется после публикации на GitHub)');
    if (!res.ok || !res.body) throw new Error('Не удалось скачать пакет: ошибка ' + res.status);
    const reader = res.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = [];
    let got = 0;
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      got += value.length;
      progress(done + got);
    }
    const blob = new Blob(chunks);
    if (blob.size !== partBytes(f, i) || (await sha256(blob)) !== f.parts[i]) {
      throw new Error('Скачанный кусок пакета не совпал с отпечатком — нажмите «Скачать» ещё раз');
    }
    await putPackPart(partKey(f, i), blob);
    done += blob.size;
  }
}

/** Положить проверенный целый файл пакета кусками */
async function storeWhole(f: PackFile, b: Blob): Promise<void> {
  for (let i = 0; i < f.parts.length; i++) await putPackPart(partKey(f, i), b.slice(i * PART_SIZE, (i + 1) * PART_SIZE));
}

/** Файлы из ZIP (только без сжатия — так сохраняет «Сохранить пакет в файл») */
async function unzipBlobs(file: File): Promise<Blob[]> {
  const out: Blob[] = [];
  let fail: unknown = null;
  const uz = new Unzip(entry => {
    const parts: Uint8Array<ArrayBuffer>[] = [];
    entry.ondata = (err, chunk, final) => {
      if (err) { fail = err; return; }
      parts.push(chunk as Uint8Array<ArrayBuffer>);
      if (final) out.push(new Blob(parts));
    };
    entry.start();
  });
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) { uz.push(new Uint8Array(0), true); break; }
    uz.push(value);
    if (fail) throw new Error('Архив пакета повреждён');
  }
  return out;
}

/**
 * «Загрузить с диска»: файлы пакета (model_fp16.onnx, движок …wasm) или архив, сохранённый
 * кнопкой «Сохранить пакет в файл». Файл узнаётся по отпечатку, имя не важно.
 */
export async function importPack(files: readonly File[]): Promise<{ found: string[]; unknown: string[] }> {
  const found: string[] = [], unknown: string[] = [];
  for (const file of files) {
    const blobs = /\.zip$/i.test(file.name) ? await unzipBlobs(file) : [file];
    let any = false;
    for (const b of blobs) {
      const f = PACK.files.find(x => x.size === b.size);
      if (!f || (await sha256(b)) !== f.sha256) continue;
      await storeWhole(f, b);
      found.push(f.name);
      any = true;
    }
    if (!any) unknown.push(file.name);
  }
  return { found, unknown };
}

/** Весь файл пакета из кусков */
export async function packBlob(f: PackFile): Promise<Blob> {
  const parts: Blob[] = [];
  for (let i = 0; i < f.parts.length; i++) {
    const p = await getPackPart(partKey(f, i));
    if (!p) throw new Error('Пакет распознавания скачан не полностью');
    parts.push(p);
  }
  return new Blob(parts);
}

/** «Сохранить пакет в файл» — ZIP без сжатия, чтобы перенести на компьютер без интернета */
export async function packZip(): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const zip = new Zip((err, data) => { if (!err) chunks.push(data as Uint8Array<ArrayBuffer>); });
  for (const f of PACK.files) {
    const e = new ZipPassThrough(f.name);
    zip.add(e);
    for (let i = 0; i < f.parts.length; i++) {
      const p = await getPackPart(partKey(f, i));
      if (!p) throw new Error('Пакет распознавания скачан не полностью');
      e.push(new Uint8Array(await p.arrayBuffer()), i === f.parts.length - 1);
    }
  }
  zip.end();
  return new Blob(chunks, { type: 'application/zip' });
}

export const packFileName = (): string => `План-ОМП_пакет-распознавания_${PACK.id}.zip`;

export async function deletePack(): Promise<void> {
  await deletePackParts(await packKeys());
}
