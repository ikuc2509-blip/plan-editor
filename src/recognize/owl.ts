// Подготовка снимка для OWLv2 и разбор ответа модели (этап 10). Без DOM — проверяется тестами.
// Как в Owlv2ImageProcessor: снимок дополняется серым до квадрата (справа или снизу),
// уменьшается до 960×960, цвета нормируются по среднему и разбросу CLIP.
import { TEXT_LEN } from './queries';

export const OWL_SIZE = 960;
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];
/** серый, которым модель дополняет снимок до квадрата (0,5 в долях яркости) */
export const PAD_GRAY = 128;

/** Какую часть квадрата модели занимает снимок w×h (он прижат к левому верхнему углу) */
export function fitOf(w: number, h: number): { fw: number; fh: number } {
  return w >= h ? { fw: 1, fh: h / w } : { fw: w / h, fh: 1 };
}

/** RGBA квадрата size×size → значения для модели: три слоя R, G, B подряд */
export function toPixels(rgba: ArrayLike<number>, size = OWL_SIZE): Float32Array {
  const n = size * size, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[i * 4 + c]! / 255 - MEAN[c]!) / STD[c]!;
  }
  return out;
}

/** Запросы → номера слов и маска (1 — слово, 0 — дополнение), по TEXT_LEN на запрос */
export function textInputs(queries: readonly number[][]): { ids: BigInt64Array; mask: BigInt64Array } {
  const ids = new BigInt64Array(queries.length * TEXT_LEN), mask = new BigInt64Array(queries.length * TEXT_LEN);
  queries.forEach((q, k) => q.slice(0, TEXT_LEN).forEach((t, i) => { ids[k * TEXT_LEN + i] = BigInt(t); mask[k * TEXT_LEN + i] = 1n; }));
  return { ids, mask };
}

/** Найденное: номер запроса, уверенность 0…1, рамка в долях снимка (x — слева, y — сверху) */
export interface Detection {
  q: number;
  score: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Ответ модели → находки не ниже minScore. logits — [участки × запросы], boxes — [участки × 4]
 * (центр и размер в долях квадрата). Каждый участок снимка — один лучший запрос.
 */
export function decode(logits: ArrayLike<number>, boxes: ArrayLike<number>, nq: number, fit: { fw: number; fh: number }, minScore: number): Detection[] {
  const out: Detection[] = [], n = boxes.length / 4;
  for (let i = 0; i < n; i++) {
    let q = 0, best = -Infinity;
    for (let k = 0; k < nq; k++) { const v = logits[i * nq + k]!; if (v > best) { best = v; q = k; } }
    const score = sigmoid(best);
    if (score < minScore) continue;
    const cx = boxes[i * 4]!, cy = boxes[i * 4 + 1]!, w = boxes[i * 4 + 2]!, h = boxes[i * 4 + 3]!;
    const d = { q, score, x0: clamp((cx - w / 2) / fit.fw), y0: clamp((cy - h / 2) / fit.fh), x1: clamp((cx + w / 2) / fit.fw), y1: clamp((cy + h / 2) / fit.fh) };
    // рамка целиком в сером поле — не на снимке
    if (d.x1 - d.x0 > 0.005 && d.y1 - d.y0 > 0.005) out.push(d);
  }
  return out;
}

const inter = (a: Detection, b: Detection) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const area = (d: Detection) => (d.x1 - d.x0) * (d.y1 - d.y0);

export function iou(a: Detection, b: Detection): number {
  const i = inter(a, b), u = area(a) + area(b) - i;
  return u > 0 ? i / u : 0;
}

/** какая доля меньшей рамки лежит внутри другой: створка двери внутри всей двери — почти 1 */
export function inside(a: Detection, b: Detection): number {
  const m = Math.min(area(a), area(b));
  return m > 0 ? inter(a, b) / m : 0;
}


/**
 * Убрать повторы: одно окно модель видит несколькими рамками. Оставляется самая уверенная;
 * рамки того же вида с перекрытием больше same, любого вида — больше other, отбрасываются.
 * Рамка того же вида почти целиком внутри другой (створка внутри двери) — остаётся бо́льшая,
 * если она не намного менее уверенная. group — вид находки (несколько запросов «доска» — один вид).
 */
export function suppress(dets: readonly Detection[], group: (q: number) => string, same = 0.3, other = 0.7): Detection[] {
  const keep: Detection[] = [];
  for (const d of [...dets].sort((a, b) => b.score - a.score)) {
    const k = keep.findIndex(x => (group(x.q) === group(d.q) ? iou(x, d) > same || inside(x, d) > 0.8 : iou(x, d) > other));
    if (k < 0) { keep.push(d); continue; }
    const x = keep[k]!;
    // d охватывает x — берём целый объект вместо части
    if (group(x.q) === group(d.q) && area(d) > area(x) && inside(x, d) > 0.8 && d.score >= 0.8 * x.score) keep[k] = d;
  }
  return keep;
}
