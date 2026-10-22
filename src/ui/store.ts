// Состояние интерфейса. План меняется только через dispatch(действие) —
// каждое состояние сохраняется в истории (заготовка под отмену и повтор, этап 5).
import { computed, signal } from '@preact/signals';
import type { Plan, Selection } from '../model/types';
import { example } from '../model/state';
import { loadPlan } from '../model/migrate';
import { loadLocal, saveLocal } from '../storage/local';

export type TabKey = 'room' | 'walls' | 'items' | 'markers' | 'under' | 'stamp';

function initial(): Plan {
  const r = loadPlan(loadLocal());
  return r.ok ? r.plan : example();
}

export const plan = signal<Plan>(initial());
export const sel = signal<Selection | null>(null);
export const tab = signal<TabKey>('room');
export const zoom = signal(1);

/* история */
const HISTORY_MAX = 100;
const past = signal<Plan[]>([]);
const future = signal<Plan[]>([]);
let lastKey: string | null = null;

export const canUndo = computed(() => past.value.length > 0);
export const canRedo = computed(() => future.value.length > 0);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveLocal(plan.value), 300);
}

/**
 * Применить действие к плану. key склеивает череду мелких изменений в один шаг истории:
 * набор цифр в одном поле или одно перетаскивание.
 */
export function dispatch(action: (p: Plan) => Plan, key?: string): void {
  const next = action(plan.value);
  if (next === plan.value) return;
  if (!key || key !== lastKey) past.value = [...past.value, plan.value].slice(-HISTORY_MAX);
  lastKey = key ?? null;
  future.value = [];
  plan.value = next;
  scheduleSave();
}

/** Заменить план целиком (пример, пустой, открытый файл) — тоже шаг истории */
export function replacePlan(p: Plan): void {
  dispatch(() => p);
  lastKey = null;
  sel.value = null;
}

export function undo(): void {
  const prev = past.value.at(-1);
  if (!prev) return;
  past.value = past.value.slice(0, -1);
  future.value = [plan.value, ...future.value];
  plan.value = prev;
  lastKey = null;
  scheduleSave();
}

export function redo(): void {
  const next = future.value[0];
  if (!next) return;
  future.value = future.value.slice(1);
  past.value = [...past.value, plan.value];
  plan.value = next;
  lastKey = null;
  scheduleSave();
}

/** Конец череды изменений: следующее изменение — новый шаг истории */
export function endGesture(): void {
  lastKey = null;
}

/* всплывающее сообщение внизу экрана */
export const toastMsg = signal<{ text: string; n: number } | null>(null);
let toastN = 0;
export function toast(text: string): void {
  toastMsg.value = { text, n: ++toastN };
}
