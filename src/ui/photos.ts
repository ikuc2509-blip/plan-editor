// Снимки проекта в интерфейсе: добавить (файлы, камера), уменьшенные копии,
// собрать для файла .omp, принять из открытого файла.
import { computed, signal } from '@preact/signals';
import type { Photo, Plan } from '../model/types';
import { addPhotos, nextPhotoNumber } from '../model/actions';
import { uid } from '../model/state';
import { describePhoto, formatSize, type NewPhoto } from '../photos/meta';
import type { ShotItem } from '../photos/shots';
import { makePreview } from '../photos/image';
import { getPhoto, getPreview, prunePhotos, putPhoto, putPreview } from '../storage/db';
import { pickFiles } from '../storage/files';
import { dispatch, plan, toast } from './store';

/** снимок, открытый в карточке на вкладке «Фото» */
export const selPhoto = signal<string | null>(null);
/** вес снимков проекта, байт */
export const photosBytes = computed(() => plan.value.photos.reduce((s, p) => s + p.size, 0));

/** Добавить снимки; из пункта списка съёмки — сразу с видом и привязкой */
export async function addNewPhotos(files: NewPhoto[], shot?: ShotItem): Promise<void> {
  if (!files.length) return;
  const taken = new Set(plan.value.photos.map(p => p.file.toLowerCase()));
  let n = parseInt(nextPhotoNumber(plan.value)) || 1;
  const list: Photo[] = [];
  for (const f of files) {
    const id = uid();
    const ph = await describePhoto(f, id, String(n++), taken,
      shot ? { kind: shot.kind, link: shot.link, shot: shot.key } : { kind: '', link: { kind: 'none' }, shot: '' });
    taken.add(ph.file.toLowerCase());
    // оригинал — байт в байт, как получен
    const blob = new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: ph.type });
    await putPhoto(id, blob);
    const prev = await makePreview(blob);
    if (prev) await putPreview(id, prev);
    list.push(ph);
  }
  dispatch(p => addPhotos(p, list));
  selPhoto.value = list[list.length - 1]!.id;
  toast(`Добавлено снимков: ${list.length}. Сохраните проект в файл — так снимки не потеряются.`);
}

const fromFile = async (f: File): Promise<NewPhoto> =>
  ({ bytes: new Uint8Array(await f.arrayBuffer()), name: f.name, type: f.type, source: 'file' });

export async function pickPhotos(shot?: ShotItem): Promise<void> {
  const files = await pickFiles('image/*');
  if (!files.length) return;
  toast('Добавляю снимки…');
  await addNewPhotos(await Promise.all(files.map(fromFile)), shot);
}

/** Снимок встроенной камеры: имя и время — по моменту съёмки */
export async function addCameraShot(blob: Blob, shot?: ShotItem): Promise<void> {
  const now = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  await addNewPhotos([{ bytes: new Uint8Array(await blob.arrayBuffer()), name: `camera_${stamp}.jpg`, type: blob.type || 'image/jpeg', source: 'camera', takenAt: local }], shot);
}

/* уменьшенные копии: адреса blob: живут, пока открыта вкладка */
const urls = new Map<string, string>();

export async function previewUrl(id: string): Promise<string | null> {
  if (urls.has(id)) return urls.get(id)!;
  let prev = await getPreview(id);
  if (!prev) {
    // после открытия файла копий ещё нет — делаем из оригинала
    const orig = await getPhoto(id);
    prev = orig && await makePreview(orig);
    if (prev) await putPreview(id, prev);
  }
  if (!prev) return null;
  const u = URL.createObjectURL(prev);
  urls.set(id, u);
  return u;
}

export async function originalUrl(id: string): Promise<string | null> {
  const b = await getPhoto(id);
  return b ? URL.createObjectURL(b) : null;
}

/** Оригиналы снимков плана для файла .omp: имя в photos/ → байты */
export async function photoFiles(p: Plan): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const ph of p.photos) {
    const b = ph.file ? await getPhoto(ph.id) : null;
    if (b) out[ph.file] = new Uint8Array(await b.arrayBuffer());
  }
  return out;
}

/** Снимки открытого файла — в браузер вместо прежних */
export async function importPhotos(p: Plan, files: Readonly<Record<string, Uint8Array>>): Promise<void> {
  await clearPhotos();
  for (const ph of p.photos) {
    const b = files[ph.file];
    if (b) await putPhoto(ph.id, new Blob([b as Uint8Array<ArrayBuffer>], { type: ph.type }));
  }
}

/** Новый проект: снимки прежнего убираются из браузера */
export async function clearPhotos(): Promise<void> {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  selPhoto.value = null;
  await prunePhotos(new Set());
}

export const weightText = (): string => formatSize(photosBytes.value);
