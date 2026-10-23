// Выпрямленные снимки стен для экрана (этап 9): окно «Выпрямить» и готовые картинки для листа.
// Картинки считаются из оригиналов в этом браузере и в файл не пишутся (decisions.md).
import { effect, signal } from '@preact/signals';
import type { WallPhoto } from '../model/types';
import { frameAspect } from '../model/wallPhotos';
import { getPhoto } from '../storage/db';
import { rectifiedUrl, workImage, type WorkImage } from '../photos/rectify';
import { plan } from './store';

/** открыто окно «Выпрямить»: какой снимок; wpId — правим уже положенный кадр */
export const rectifying = signal<{ photoId: string; wpId?: string; wallId?: string; scale?: boolean } | null>(null);

export function openRectify(photoId: string, o: { wpId?: string; wallId?: string; scale?: boolean } = {}): void {
  rectifying.value = { photoId, ...o };
}

/** рабочая копия снимка (до 2400 px) — для окна и для выпрямления */
export const photoWork = (id: string): Promise<WorkImage | null> => workImage(id, () => getPhoto(id));

/** выпрямленные кадры для листа на экране: id кадра → адрес картинки */
export const wallImages = signal<Readonly<Record<string, string>>>({});

const keyOf = (wp: WallPhoto, aspect: number) => `${wp.photoId}|${wp.quad.map(q => q.x.toFixed(5) + ',' + q.y.toFixed(5)).join(';')}|${aspect.toFixed(4)}`;
/** что уже посчитано: id кадра → ключ и адрес */
const done = new Map<string, { key: string; url: string }>();
let busy: Promise<void> = Promise.resolve();

async function refresh(): Promise<void> {
  const p = plan.value;
  const next: Record<string, string> = {};
  for (const wp of p.wallPhotos) {
    const aspect = frameAspect(p, wp);
    if (!aspect || !p.photos.some(ph => ph.id === wp.photoId)) continue;
    const key = keyOf(wp, aspect), old = done.get(wp.id);
    if (old?.key === key) { next[wp.id] = old.url; continue; }
    const w = await photoWork(wp.photoId);
    const url = w && await rectifiedUrl(w.raster, wp.quad, aspect);
    if (!url) continue;
    if (old) URL.revokeObjectURL(old.url);
    done.set(wp.id, { key, url });
    next[wp.id] = url;
  }
  for (const [id, d] of done) if (!(id in next)) { URL.revokeObjectURL(d.url); done.delete(id); }
  wallImages.value = next;
}

/** Следить за планом: новый кадр, другие углы, другие размеры стены — пересчитать */
export function initWallImages(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    void plan.value.wallPhotos; void plan.value.room; void plan.value.photos;
    clearTimeout(timer);
    // при наборе размеров не пересчитываем на каждую цифру
    timer = setTimeout(() => { busy = busy.then(refresh, refresh); }, 250);
  });
}
