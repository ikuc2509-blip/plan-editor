// Состояние интерфейса. Временная версия этапа 0; на этапе 1 — хранилище с действиями и отменой.
import { signal } from '@preact/signals';
import type { Item, Marker, PlanState, Selection, WallItem } from '../model/types';
import { blankUnderlay, example, fromJson } from '../model/state';
import { loadLocal, saveLocal } from '../storage/local';

export type TabKey = 'room' | 'walls' | 'items' | 'markers' | 'under' | 'stamp';

function initial(): PlanState {
  const s = fromJson(loadLocal()) ?? example();
  s.underlay = s.underlay || blankUnderlay();
  return s;
}

export const plan = signal<PlanState>(initial());
export const sel = signal<Selection | null>(null);
export const tab = signal<TabKey>('room');
export const zoom = signal(1);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveLocal(plan.value), 300);
}

/** Изменить план: правка идёт по копии, чтобы интерфейс увидел новое состояние */
export function update(fn: (s: PlanState) => void): void {
  const s = structuredClone(plan.value);
  fn(s);
  plan.value = s;
  scheduleSave();
}

/** Заменить план целиком (пример, пустой, открытый файл) */
export function replacePlan(s: PlanState): void {
  plan.value = s;
  sel.value = null;
  scheduleSave();
}

type Collection = 'wallItems' | 'items' | 'markers';
type ElemOf<C extends Collection> = C extends 'wallItems' ? WallItem : C extends 'items' ? Item : Marker;

/** Поменять поля одного объекта по id */
export function patch<C extends Collection>(col: C, id: string, p: Partial<ElemOf<C>>): void {
  update(s => {
    const o = (s[col] as ElemOf<C>[]).find(e => e.id === id);
    if (o) Object.assign(o, p);
  });
}

export function remove(col: Collection, id: string): void {
  update(s => { (s[col] as { id: string }[]) = s[col].filter(x => x.id !== id); });
  if (sel.value?.id === id) sel.value = null;
}

/* всплывающее сообщение внизу экрана */
export const toastMsg = signal<{ text: string; n: number } | null>(null);
let toastN = 0;
export function toast(text: string): void {
  toastMsg.value = { text, n: ++toastN };
}
