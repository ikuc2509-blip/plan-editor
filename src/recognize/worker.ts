// Фоновый поток распознавания (этап 10): модель считается здесь, чтобы окно не зависало.
// Модель и движок приходят из пакета в браузере; из сети этот поток ничего не загружает.
import * as ort from 'onnxruntime-web';

export type ToWorker =
  | { t: 'init'; model: ArrayBuffer; wasm: ArrayBuffer; gpu: boolean }
  | { t: 'run'; n: number; pixels: Float32Array; ids: BigInt64Array; mask: BigInt64Array; nq: number; size: number };

export type FromWorker =
  | { t: 'ready'; ep: 'webgpu' | 'wasm'; gpuError?: string }
  | { t: 'out'; n: number; logits: Float32Array; boxes: Float32Array; ms: number }
  | { t: 'error'; n?: number; message: string };

// в проекте подключены типы страницы, а не потока — нужное описываем сами
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage(m: FromWorker, transfer?: Transferable[]): void;
};

let session: ort.InferenceSession | null = null;

/** почему не подошла видеокарта — для «Файл → Распознавание» */
let gpuError: string | undefined;

async function init(m: Extract<ToWorker, { t: 'init' }>): Promise<'webgpu' | 'wasm'> {
  ort.env.wasm.wasmBinary = m.wasm;
  // без особых заголовков сервера (у GitHub Pages их нет) потоки WebAssembly недоступны
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  // предупреждения движка о распределении операций — не ошибки, в консоль не нужны
  ort.env.logLevel = 'error';
  const model = new Uint8Array(m.model);
  if (m.gpu) {
    try {
      session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'], logSeverityLevel: 3 });
      return 'webgpu';
    } catch (e) {
      // видеокарта не подошла — считаем на процессоре
      gpuError = e instanceof Error ? e.message : String(e);
    }
  }
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], logSeverityLevel: 3 });
  return 'wasm';
}

async function run(m: Extract<ToWorker, { t: 'run' }>): Promise<void> {
  if (!session) throw new Error('Модель не загружена');
  const t0 = performance.now();
  const out = await session.run({
    input_ids: new ort.Tensor('int64', m.ids, [m.nq, m.ids.length / m.nq]),
    attention_mask: new ort.Tensor('int64', m.mask, [m.nq, m.mask.length / m.nq]),
    pixel_values: new ort.Tensor('float32', m.pixels, [1, 3, m.size, m.size]),
    // остальные выходы (признаки снимка, 11 МБ) не нужны — не забираем их с видеокарты
  }, ['logits', 'pred_boxes']);
  const logits = (await out.logits!.getData()) as Float32Array, boxes = (await out.pred_boxes!.getData()) as Float32Array;
  for (const t of Object.values(out)) t.dispose();
  scope.postMessage({ t: 'out', n: m.n, logits, boxes, ms: Math.round(performance.now() - t0) }, [logits.buffer, boxes.buffer]);
}

scope.onmessage = e => {
  const m = e.data;
  const fail = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    scope.postMessage({ t: 'error', n: m.t === 'run' ? m.n : undefined, message: m.t === 'init' && gpuError ? `видеокарта: ${gpuError}; процессор: ${msg}` : msg });
  };
  if (m.t === 'init') init(m).then(ep => scope.postMessage({ t: 'ready', ep, gpuError }), fail);
  else run(m).catch(fail);
};
