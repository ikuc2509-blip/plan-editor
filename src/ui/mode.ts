// Режим интерфейса: «На месте» (телефон) или «Чистовик» (компьютер).
// Данные и рисование общие; выбор — настройка этого браузера, в файл проекта не пишется.
import { signal } from '@preact/signals';
import { loadPref, savePref } from '../storage/prefs';

export type UiMode = 'onsite' | 'editor';

export const MODE_NAMES: Record<UiMode, string> = { onsite: 'На месте', editor: 'Чистовик' };

/** Телефон — сенсорный экран, короткая сторона меньше 600 px: по умолчанию «На месте» */
export function defaultMode(touch: boolean, shortSide: number): UiMode {
  return touch && shortSide < 600 ? 'onsite' : 'editor';
}

function detect(): UiMode {
  if (typeof window === 'undefined') return 'editor';
  const touch = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  return defaultMode(touch, Math.min(window.screen.width, window.screen.height));
}

const isMode = (v: unknown): v is UiMode => v === 'onsite' || v === 'editor';

// запоминается только выбор пользователя: иначе режим определяется по устройству при каждом запуске
export const uiMode = signal<UiMode>(loadPref('mode', detect(), isMode));

export function setMode(m: UiMode): void {
  uiMode.value = m;
  savePref('mode', m);
}
