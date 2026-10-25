// Экран не гаснет в режиме «На месте» (этап 11): телефон лежит, пока меряют рулеткой.
// Браузер сам снимает запрет, когда приложение уходит в фон, — при возврате просим снова.
import { effect, signal } from '@preact/signals';
import { loadPref, savePref } from '../../storage/prefs';

export const wakeSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/** включено пользователем (по умолчанию — да); запоминается в этом браузере */
export const keepAwake = signal(loadPref('keep-awake', true, (v): v is boolean => typeof v === 'boolean'));
/** запрет сейчас действует */
export const awake = signal(false);

let lock: WakeLockSentinel | null = null;
let active = false;

async function acquire(): Promise<void> {
  if (!wakeSupported || !active || !keepAwake.value || lock || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    awake.value = true;
    lock.addEventListener('release', () => { lock = null; awake.value = false; });
  } catch {
    // нет разрешения или режим экономии — экран гаснет как обычно
    awake.value = false;
  }
}

function release(): void {
  void lock?.release();
  lock = null;
  awake.value = false;
}

const onVisible = () => { void acquire(); };

/** Режим «На месте» открыт; возвращает функцию «закрыт» */
export function startWake(): () => void {
  active = true;
  document.addEventListener('visibilitychange', onVisible);
  const stop = effect(() => {
    savePref('keep-awake', keepAwake.value);
    if (keepAwake.value) void acquire(); else release();
  });
  return () => {
    active = false;
    stop();
    document.removeEventListener('visibilitychange', onVisible);
    release();
  };
}
