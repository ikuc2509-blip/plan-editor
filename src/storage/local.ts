// Рабочая копия плана в браузере (до этапа 3 — localStorage, потом IndexedDB).
import type { Plan } from '../model/types';

const KEY = 'plan-editor:plan';
/** где хранил план прототип и этап 0 — читаем один раз для перевода */
const OLD_KEY = 'mesto-plan-v1';

/** Сохранённый план в любом формате; null — ничего нет */
export function loadLocal(): unknown {
  for (const k of [KEY, OLD_KEY]) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) return JSON.parse(raw);
    } catch { /* повреждено или хранилище недоступно — пробуем дальше */ }
  }
  return null;
}

export function saveLocal(s: Plan): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // переполнение хранилища — обычно из-за подложки; сохраняем план без неё
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...s, underlay: { ...s.underlay, src: '' } }));
    } catch { /* хранилище недоступно — план живёт только в памяти */ }
  }
}
