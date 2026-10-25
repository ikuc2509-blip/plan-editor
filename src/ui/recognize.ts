// Распознавание в «Чистовике» (этап 10): пакет, запуск модели на выпрямленном кадре и слой
// предложений. Предложения живут только здесь, в файл не пишутся; на лист попадает только
// принятое человеком (CLAUDE.md, правило 6).
import { computed, signal } from '@preact/signals';
import type { Mm, WallItemType } from '../model/types';
import * as A from '../model/actions';
import { WI_TYPES } from '../model/labels';
import { uid } from '../model/state';
import { photoBoxOf, wallRectOfFrame } from '../model/wallPhotos';
import { packSize } from '../recognize/packInfo';
import { QUERIES } from '../recognize/queries';
import type { Detection } from '../recognize/owl';
import { hasGpu, recognize, stopEngine, type Device } from '../recognize/engine';
import { deletePack, downloadPack, importPack, packFileName, packHave, packZip } from '../storage/pack';
import { pickFiles, saveFile } from '../storage/files';
import { dispatch, plan, sel, tab, toast } from './store';
import { wallImages } from './rectify';

/* ——— пакет ——— */

/** сколько байт пакета уже в браузере; null — ещё не проверяли */
export const packBytes = signal<number | null>(null);
export const packReady = computed(() => packBytes.value === packSize());
/** идёт скачивание, загрузка с диска или сохранение: что и сколько готово */
export const packBusy = signal<{ what: 'download' | 'import' | 'export'; done: number } | null>(null);
/** есть ли видеокарта для расчётов; null — ещё не проверяли */
export const gpu = signal<boolean | null>(null);

export async function refreshPack(): Promise<void> {
  packBytes.value = await packHave();
  gpu.value ??= await hasGpu();
}

let abort: AbortController | null = null;

export async function startDownload(): Promise<void> {
  if (packBusy.value) return;
  abort = new AbortController();
  packBusy.value = { what: 'download', done: packBytes.value ?? 0 };
  try {
    await downloadPack(done => { packBusy.value = { what: 'download', done }; }, abort.signal);
    toast('Пакет распознавания скачан и проверен');
  } catch (e) {
    if (!abort.signal.aborted) toast(e instanceof Error ? e.message : 'Не удалось скачать пакет');
  } finally {
    packBusy.value = null;
    abort = null;
    await refreshPack();
  }
}

export function cancelDownload(): void {
  abort?.abort();
}

export async function importFromDisk(): Promise<void> {
  const files = await pickFiles('.onnx,.wasm,.zip');
  if (!files.length) return;
  packBusy.value = { what: 'import', done: 0 };
  try {
    const r = await importPack(files);
    await refreshPack();
    if (packReady.value) toast('Пакет распознавания загружен с диска и проверен');
    else if (r.found.length) toast(`Загружено: ${r.found.join(', ')}. Не хватает остальных файлов пакета`);
    else toast('Это не файлы пакета распознавания (отпечаток не совпал)');
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Не удалось загрузить файлы');
  } finally {
    packBusy.value = null;
  }
}

export async function exportToFile(): Promise<void> {
  packBusy.value = { what: 'export', done: 0 };
  try {
    saveFile(packFileName(), await packZip());
    toast('Пакет сохранён: ' + packFileName());
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Не удалось сохранить пакет');
  } finally {
    packBusy.value = null;
  }
}

export async function removePack(): Promise<void> {
  if (!confirm('Удалить пакет распознавания из браузера? Чтобы распознавать снова, его придётся скачать заново.')) return;
  stopEngine();
  device.value = null;
  await deletePack();
  await refreshPack();
}

/* ——— распознавание ——— */

/** на чём считает модель: видеокарта или процессор; null — модель не загружена */
export const device = signal<Device | null>(null);
/** какой кадр сейчас распознаётся */
export const recognizing = signal<string | null>(null);

/** находки по кадрам: для какой выпрямленной картинки, сами находки, время расчёта */
const found = signal<Readonly<Record<string, { url: string; dets: Detection[]; ms: number }>>>({});
/** время последнего распознавания, мс — для замера скорости (TODO этапа 10) */
export const lastMs = signal<number | null>(null);

/** порог уверенности: ниже — рамка не показывается */
export const threshold = signal(0.2);
/** удалённые и принятые предложения */
const gone = signal<ReadonlySet<string>>(new Set());
/** выбранное предложение (подсвечено на листе и в списке) */
export const suggSel = signal<string | null>(null);
/** открыто окно сравнения: какой кадр */
export const comparing = signal<string | null>(null);

export interface Suggestion {
  id: string;
  wpId: string;
  wallId: string;
  type: WallItemType;
  score: number;
  /** участок стены */
  r: { off: Mm; z: Mm; w: Mm; h: Mm };
  /** рамка на выпрямленном кадре, доли */
  det: Detection;
}

/** Предложения, которые сейчас видны: выше порога, не удалены и не приняты, кадр не менялся */
export const suggestions = computed<Suggestion[]>(() => {
  const p = plan.value, out: Suggestion[] = [];
  for (const [wpId, f] of Object.entries(found.value)) {
    const wp = p.wallPhotos.find(w => w.id === wpId);
    // углы или края кадра поправили — выпрямленная картинка другая, старые рамки к ней не подходят
    if (!wp || wallImages.value[wpId] !== f.url) continue;
    f.dets.forEach((det, i) => {
      const id = `${wpId}:${i}`;
      if (det.score < threshold.value || gone.value.has(id)) return;
      const r = wallRectOfFrame(p, wp, det);
      if (r && r.w >= 50 && r.h >= 50) out.push({ id, wpId, wallId: wp.wallId, type: QUERIES[det.q]!.type, score: det.score, r, det });
    });
  }
  return out;
});

/** Сколько найдено по видам: «окно — 3, радиатор — 2» */
export function countText(list: readonly Suggestion[]): string {
  const n = new Map<WallItemType, number>();
  for (const s of list) n.set(s.type, (n.get(s.type) ?? 0) + 1);
  return [...n].map(([t, k]) => `${WI_TYPES[t].toLowerCase()} — ${k}`).join(', ');
}

async function frameBitmap(url: string): Promise<ImageBitmap> {
  return createImageBitmap(await (await fetch(url)).blob());
}

/** «Найти окна, двери…» на выпрямленном кадре */
export async function recognizeFrame(wpId: string): Promise<void> {
  if (recognizing.value) return;
  const url = wallImages.value[wpId];
  if (!url) { toast('Снимок ещё выпрямляется — попробуйте через пару секунд'); return; }
  if (!packReady.value) { toast('Сначала скачайте пакет распознавания: вкладка «Файл»'); tab.value = 'file'; return; }
  recognizing.value = wpId;
  if (gpu.value === false && !device.value) toast('Видеокарта недоступна — считаю на процессоре, это около минуты');
  try {
    const r = await recognize(await frameBitmap(url));
    device.value = r.device;
    lastMs.value = r.ms;
    found.value = { ...found.value, [wpId]: { url, dets: r.dets, ms: r.ms } };
    gone.value = new Set([...gone.value].filter(id => !id.startsWith(wpId + ':')));
    const mine = suggestions.value.filter(s => s.wpId === wpId);
    tab.value = 'walls';
    toast(mine.length
      ? `Найдено: ${countText(mine)}. Это предложения — проверьте рамки на развёртке и примите нужные`
      : 'Ничего не найдено выше порога уверенности. Можно снизить порог или обвести вручную');
  } catch (e) {
    toast('Не удалось распознать: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    recognizing.value = null;
  }
}

export const MODEL_NAME = 'OWLv2';

/** Принять предложение: элемент стены «условно», происхождение — снимок и «предложено моделью» */
export function accept(id: string, type?: WallItemType): void {
  const s = suggestions.value.find(x => x.id === id);
  const wp = s && plan.value.wallPhotos.find(w => w.id === s.wpId);
  if (!s || !wp) return;
  const box = photoBoxOf(plan.value, wp, s.r) ?? { x: 0, y: 0, w: 1, h: 1 };
  const itemId = uid();
  dispatch(q => A.addTracedWallItem(q, itemId, type ?? s.type, s.wallId, s.r, {
    kind: 'photo', photoId: wp.photoId, box, auto: { model: MODEL_NAME, score: Math.round(s.score * 100) / 100 },
  }));
  gone.value = new Set([...gone.value, id]);
  if (suggSel.value === id) suggSel.value = null;
}

/** Принять все видимые предложения (одним шагом отмены) */
export function acceptAll(wpId?: string): void {
  const list = suggestions.value.filter(s => !wpId || s.wpId === wpId);
  if (!list.length) return;
  const p0 = plan.value;
  dispatch(q => list.reduce((acc, s) => {
    const wp = p0.wallPhotos.find(w => w.id === s.wpId);
    if (!wp) return acc;
    const box = photoBoxOf(p0, wp, s.r) ?? { x: 0, y: 0, w: 1, h: 1 };
    return A.addTracedWallItem(acc, uid(), s.type, s.wallId, s.r, { kind: 'photo', photoId: wp.photoId, box, auto: { model: MODEL_NAME, score: Math.round(s.score * 100) / 100 } });
  }, q));
  gone.value = new Set([...gone.value, ...list.map(s => s.id)]);
  suggSel.value = null;
  toast(`Принято: ${countText(list)}. Размеры — «условно»`);
}

export function dismiss(id: string): void {
  gone.value = new Set([...gone.value, id]);
  if (suggSel.value === id) suggSel.value = null;
}

export function dismissAll(wpId?: string): void {
  gone.value = new Set([...gone.value, ...suggestions.value.filter(s => !wpId || s.wpId === wpId).map(s => s.id)]);
  suggSel.value = null;
}

/** Выбрать предложение щелчком по листу */
export function pickSuggestion(id: string): void {
  suggSel.value = id;
  sel.value = null;
  tab.value = 'walls';
}
