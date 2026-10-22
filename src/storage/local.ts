// Рабочая копия плана в браузере (до этапа 3 — localStorage, потом IndexedDB).
import type { PlanState } from '../model/types';

const KEY = 'mesto-plan-v1';

export function loadLocal(): unknown {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocal(s: PlanState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // переполнение хранилища — обычно из-за подложки; сохраняем план без неё
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...s, underlay: { ...s.underlay, src: '' } }));
    } catch { /* хранилище недоступно — план живёт только в памяти */ }
  }
}
