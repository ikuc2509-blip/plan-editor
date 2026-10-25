// Распознавание выпрямленного кадра (этап 10): снимок → квадрат 960×960 → фоновый поток с
// моделью → находки в долях кадра. Поток запускается при первом распознавании и держит модель
// в памяти, пока не нажато «Выгрузить» или не удалён пакет.
import { PACK } from './packInfo';
import { QUERIES } from './queries';
import { OWL_SIZE, PAD_GRAY, decode, fitOf, suppress, textInputs, toPixels, type Detection } from './owl';
import type { FromWorker, ToWorker } from './worker';
import { packBlob } from '../storage/pack';

export type Device = 'webgpu' | 'wasm';

/** самая низкая уверенность, которую вообще запоминаем; порог на экране — выше */
export const MIN_SCORE = 0.05;

let worker: Worker | null = null;
let ready: Promise<Device> | null = null;
let n = 0;
/** почему не подошла видеокарта (если не подошла) */
export let gpuError: string | null = null;
const waiting = new Map<number, { ok: (m: Extract<FromWorker, { t: 'out' }>) => void; fail: (e: Error) => void }>();

/** Есть ли в браузере видеокарта для расчётов (WebGPU) */
export async function hasGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  try { return !!gpu && !!(await gpu.requestAdapter()); } catch { return false; }
}

/** Запустить поток и загрузить модель из пакета; повторный вызов ждёт тот же запуск */
export function startEngine(): Promise<Device> {
  ready ??= (async () => {
    const model = PACK.files.find(f => f.key === 'model')!, wasm = PACK.files.find(f => f.key === 'wasm')!;
    const [mb, wb, gpu] = await Promise.all([packBlob(model).then(b => b.arrayBuffer()), packBlob(wasm).then(b => b.arrayBuffer()), hasGpu()]);
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    return new Promise<Device>((resolve, reject) => {
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.t === 'ready') { gpuError = m.gpuError ?? null; resolve(m.ep); }
        else if (m.t === 'out') { waiting.get(m.n)?.ok(m); waiting.delete(m.n); }
        else if (m.n !== undefined) { waiting.get(m.n)?.fail(new Error(m.message)); waiting.delete(m.n); }
        else reject(new Error(m.message));
      };
      w.onerror = e => reject(new Error(e.message || 'Не удалось запустить распознавание'));
      w.postMessage({ t: 'init', model: mb, wasm: wb, gpu } satisfies ToWorker, [mb, wb]);
    });
  })();
  ready.catch(() => stopEngine());
  return ready;
}

/** Освободить память: поток с моделью закрывается */
export function stopEngine(): void {
  worker?.terminate();
  worker = null;
  ready = null;
  for (const w of waiting.values()) w.fail(new Error('Распознавание остановлено'));
  waiting.clear();
}

/** Снимок на квадрате модели: прижат к левому верхнему углу, остальное серое */
function square(img: ImageBitmap): Uint8ClampedArray {
  const c = new OffscreenCanvas(OWL_SIZE, OWL_SIZE), g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = `rgb(${PAD_GRAY},${PAD_GRAY},${PAD_GRAY})`;
  g.fillRect(0, 0, OWL_SIZE, OWL_SIZE);
  const k = OWL_SIZE / Math.max(img.width, img.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, img.width * k, img.height * k);
  return g.getImageData(0, 0, OWL_SIZE, OWL_SIZE).data;
}

export interface Found {
  dets: Detection[];
  ms: number;
  device: Device;
}

/** Найти окна, двери, радиаторы, доски и экраны на выпрямленном кадре */
export async function recognize(img: ImageBitmap): Promise<Found> {
  const device = await startEngine();
  const w = worker!;
  const pixels = toPixels(square(img));
  const { ids, mask } = textInputs(QUERIES.map(q => q.ids));
  const k = ++n;
  const out = await new Promise<Extract<FromWorker, { t: 'out' }>>((ok, fail) => {
    waiting.set(k, { ok, fail });
    w.postMessage({ t: 'run', n: k, pixels, ids, mask, nq: QUERIES.length, size: OWL_SIZE } satisfies ToWorker, [pixels.buffer]);
  });
  const raw = decode(out.logits, out.boxes, QUERIES.length, fitOf(img.width, img.height), MIN_SCORE);
  return { dets: suppress(raw, q => QUERIES[q]!.type), ms: out.ms, device };
}
