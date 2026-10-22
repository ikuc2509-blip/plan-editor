// Состояние интерфейса. План меняется только через dispatch(действие) — каждое
// состояние попадает в историю отмены (кнопки — этап 5). Рабочая копия и история
// состояний хранятся в браузере (src/storage/db.ts).
import { computed, effect, signal } from '@preact/signals';
import type { Mm, Plan, Selection } from '../model/types';
import { example } from '../model/state';
import { loadPlan } from '../model/migrate';
import { addSnapshot, listSnapshots, loadWork, requestPersist, saveWork, type Snapshot } from '../storage/db';
import { snapshotDue } from '../storage/history';
import { loadPref, savePref } from '../storage/prefs';
import type { ProjectMeta } from '../storage/omp';

export type TabKey = 'room' | 'walls' | 'items' | 'markers' | 'callouts' | 'measure' | 'photos' | 'under' | 'stamp' | 'file';

export const freshMeta = (now = new Date()): ProjectMeta => ({ created: now.toISOString(), modified: now.toISOString(), saveNumber: 0 });

export const plan = signal<Plan>(example());
export const sel = signal<Selection | null>(null);
export const tab = signal<TabKey>('room');
export const zoom = signal(1);

/** Шаг привязки к сетке при перетаскивании, мм; 0 — без привязки. Настройка браузера, не плана. */
export const GRID_STEPS: readonly Mm[] = [0, 10, 50, 100];
export const gridStep = signal<Mm>(loadPref('grid', 50, (v): v is Mm => GRID_STEPS.includes(v as Mm)));
effect(() => savePref('grid', gridStep.value));

/* проект и файл */
export const meta = signal<ProjectMeta>(freshMeta());
/** с какого момента есть изменения, не сохранённые в файл */
export const dirtySince = signal<number | null>(null);
export const fileSavedAt = signal<number | null>(null);
/** сохранять с паролем */
export const protect = signal(false);
/** пароль — только в памяти, до закрытия вкладки */
export const password = signal<string | null>(null);
/** браузер обещал не удалять данные сайта */
export const persisted = signal<boolean | null>(null);
export const snapshots = signal<Snapshot[]>([]);

/** подписчики на любое изменение плана (автосохранение в файл) */
export const planChanged = new Set<() => void>();

/* отмена и повтор */
const UNDO_MAX = 100;
const past = signal<Plan[]>([]);
const future = signal<Plan[]>([]);
let lastKey: string | null = null;

export const canUndo = computed(() => past.value.length > 0);
export const canRedo = computed(() => future.value.length > 0);

/* сохранение рабочей копии */
let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function persistWork(now = false): void {
  clearTimeout(saveTimer);
  if (now) void flushWork(); else saveTimer = setTimeout(() => void flushWork(), 300);
}

/** Записать рабочую копию сейчас и дождаться записи (перед обновлением приложения) */
export function flushWork(): Promise<void> {
  clearTimeout(saveTimer);
  return saveWork({ plan: plan.value, meta: meta.value, dirtySince: dirtySince.value, fileSavedAt: fileSavedAt.value, protect: protect.value });
}

let changedSinceSnap = false;
let lastSnapAt: number | null = null;

function changed(): void {
  dirtySince.value ??= Date.now();
  changedSinceSnap = true;
  persistWork();
  for (const f of planChanged) f();
}

/**
 * Применить действие к плану. key склеивает череду мелких изменений в один шаг истории:
 * набор цифр в одном поле или одно перетаскивание.
 */
export function dispatch(action: (p: Plan) => Plan, key?: string): void {
  const next = action(plan.value);
  if (next === plan.value) return;
  if (!key || key !== lastKey) past.value = [...past.value, plan.value].slice(-UNDO_MAX);
  lastKey = key ?? null;
  future.value = [];
  plan.value = next;
  changed();
}

export async function snapshot(label: string): Promise<void> {
  await addSnapshot({ at: Date.now(), label, plan: plan.value });
  lastSnapAt = Date.now();
  changedSinceSnap = false;
  snapshots.value = await listSnapshots();
}

export interface ReplaceOpts {
  /** для истории: «до открытия файла» и т. п. */
  label: string;
  /** сведения о проекте; не задано — новый проект */
  meta?: ProjectMeta;
  /** план совпадает с файлом на диске */
  saved?: boolean;
  /** план отличается от файла (возврат к состоянию) */
  dirty?: boolean;
}

/** Заменить план целиком (пример, пустой, открытый файл) — прежний сначала уходит в историю */
export async function replacePlan(p: Plan, o: ReplaceOpts): Promise<void> {
  await snapshot('до: ' + o.label);
  if (plan.value !== p) past.value = [...past.value, plan.value].slice(-UNDO_MAX);
  future.value = [];
  lastKey = null;
  plan.value = p;
  sel.value = null;
  meta.value = o.meta ?? freshMeta();
  fileSavedAt.value = o.saved ? Date.now() : null;
  dirtySince.value = o.dirty ? Date.now() : null;
  persistWork(true);
}

export function undo(): void {
  const prev = past.value.at(-1);
  if (!prev) return;
  past.value = past.value.slice(0, -1);
  future.value = [plan.value, ...future.value];
  plan.value = prev;
  lastKey = null;
  changed();
}

export function redo(): void {
  const next = future.value[0];
  if (!next) return;
  future.value = future.value.slice(1);
  past.value = [...past.value, plan.value];
  plan.value = next;
  lastKey = null;
  changed();
}

/** Конец череды изменений: следующее изменение — новый шаг истории */
export function endGesture(): void {
  lastKey = null;
}

/** Сохранено в файл: файл и план совпадают */
export function markSavedToFile(m: ProjectMeta): void {
  meta.value = m;
  fileSavedAt.value = Date.now();
  dirtySince.value = null;
  persistWork(true);
}

/** Загрузка рабочей копии при запуске */
export async function initStore(): Promise<void> {
  const w = await loadWork();
  if (w && 'legacy' in w) {
    // план из localStorage (этапы 0–2) — в файл он ещё не сохранялся
    const r = loadPlan(w.plan);
    if (r.ok) { plan.value = r.plan; dirtySince.value = Date.now(); }
  } else if (w) {
    const r = loadPlan(w.plan);
    if (r.ok) {
      plan.value = r.plan;
      meta.value = w.meta;
      dirtySince.value = w.dirtySince;
      fileSavedAt.value = w.fileSavedAt;
      protect.value = w.protect;
    }
  }
  persistWork(true);
  snapshots.value = await listSnapshots();
  lastSnapAt = snapshots.value[0]?.at ?? null;
  void requestPersist().then(v => { persisted.value = v; });
  // история по таймеру: раз в 5 минут, если были изменения
  setInterval(() => {
    if (snapshotDue(changedSinceSnap, lastSnapAt, Date.now())) void snapshot('автоматически');
  }, 60_000);
}

/* всплывающее сообщение внизу экрана */
export const toastMsg = signal<{ text: string; n: number } | null>(null);
let toastN = 0;
export function toast(text: string): void {
  toastMsg.value = { text, n: ++toastN };
}
