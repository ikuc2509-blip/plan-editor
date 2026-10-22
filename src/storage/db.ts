// Рабочая копия проекта в браузере (IndexedDB): текущий план, история состояний,
// файл для автосохранения. Если IndexedDB недоступна — запасной вариант localStorage.
import { openDB, type IDBPDatabase } from 'idb';
import type { Plan } from '../model/types';
import type { ProjectMeta } from './omp';
import { HISTORY_MAX } from './history';
import { clearLocal, loadLocal, saveLocal } from './local';

/** Что хранится между запусками, кроме самого плана */
export interface WorkState {
  plan: unknown;
  meta: ProjectMeta;
  /** с какого момента есть изменения, не сохранённые в файл (мс) */
  dirtySince: number | null;
  /** когда последний раз сохраняли в файл (мс) */
  fileSavedAt: number | null;
  /** сохранять с паролем (сам пароль не хранится) */
  protect: boolean;
}

export interface Snapshot {
  id?: number;
  /** мс */
  at: number;
  label: string;
  plan: Plan;
}

const DB = 'plan-editor';
let dbp: Promise<IDBPDatabase> | null = null;
let broken = false;

function db(): Promise<IDBPDatabase> {
  dbp ??= openDB(DB, 1, {
    upgrade(d) {
      d.createObjectStore('work');
      d.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('handles');
    },
  });
  return dbp;
}

/** Попросить браузер не удалять данные сайта при нехватке места. true — пообещал */
export async function requestPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch {
    return false;
  }
}

/** Рабочая копия; при первом запуске после этапа 2 — переезд из localStorage */
export async function loadWork(): Promise<WorkState | { plan: unknown; legacy: true } | null> {
  try {
    const w = await (await db()).get('work', 'current') as WorkState | undefined;
    if (w) return w;
  } catch {
    broken = true;
  }
  const old = loadLocal();
  return old ? { plan: old, legacy: true } : null;
}

export async function saveWork(w: WorkState): Promise<void> {
  if (!broken) {
    try {
      await (await db()).put('work', w, 'current');
      clearLocal();
      return;
    } catch {
      broken = true;
    }
  }
  saveLocal(w.plan as Plan);
}

export async function addSnapshot(s: Snapshot): Promise<void> {
  if (broken) return;
  try {
    const d = await db();
    await d.add('history', s);
    // оставляем только последние HISTORY_MAX
    const keys = (await d.getAllKeys('history')) as number[];
    for (const k of keys.slice(0, Math.max(0, keys.length - HISTORY_MAX))) await d.delete('history', k);
  } catch { /* история — не главное, план всё равно сохранён */ }
}

/** Новые сверху */
export async function listSnapshots(): Promise<Snapshot[]> {
  if (broken) return [];
  try {
    return ((await (await db()).getAll('history')) as Snapshot[]).reverse();
  } catch {
    return [];
  }
}

/** Файл для автосохранения (Windows, Chrome/Edge); переживает перезапуск браузера */
export async function getFileHandle(): Promise<FileSystemFileHandle | null> {
  try { return ((await (await db()).get('handles', 'autosave')) as FileSystemFileHandle | undefined) ?? null; } catch { return null; }
}

export async function setFileHandle(h: FileSystemFileHandle | null): Promise<void> {
  try {
    const d = await db();
    if (h) await d.put('handles', h, 'autosave'); else await d.delete('handles', 'autosave');
  } catch { /* без автосохранения */ }
}
