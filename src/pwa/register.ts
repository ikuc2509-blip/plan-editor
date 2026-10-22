// Работа без сети на стороне страницы: подключить помощника (sw.ts), узнать о новой
// версии, по кнопке переключиться на неё. Установка приложения из браузера.
import { signal } from '@preact/signals';
import type { SwReply } from './sw';

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** номер скачанной новой версии, которая ждёт кнопки «Обновить» */
export const updateVersion = signal<string | null>(null);
/** помощник подключён: приложение откроется без сети */
export const offlineReady = signal(false);

/** Chrome и Edge: событие «можно установить» (в типах браузера его пока нет) */
interface InstallPrompt extends Event { prompt(): Promise<void> }
export const installPrompt = signal<InstallPrompt | null>(null);
export const standalone = signal(false);

/** перезагрузка ради обновления: напоминание о несохранённом файле не нужно — работа в браузере сохранена */
export let reloadingForUpdate = false;

const CHECK_EVERY = 30 * 60_000;
/** при возврате в приложение — не чаще раза в минуту */
const CHECK_ON_RETURN = 60_000;

/** итог последней проверки — для кнопки «Проверить обновления» */
export type CheckState = 'idle' | 'checking' | 'latest' | 'found' | 'failed' | 'unavailable';
export const checkState = signal<CheckState>('idle');

let lastCheck = 0;
let running: Promise<boolean> | null = null;

function ask(type: 'check' | 'apply'): Promise<SwReply> {
  return new Promise((resolve, reject) => {
    const w = navigator.serviceWorker.controller;
    if (!w) return reject(new Error('помощник не подключён'));
    const ch = new MessageChannel();
    ch.port1.onmessage = e => {
      const r = e.data as SwReply;
      if (r.error) reject(new Error(r.error)); else resolve(r);
    };
    w.postMessage({ type }, [ch.port2]);
  });
}

/** Спросить помощника, нет ли новой версии; новая скачивается в фоне. false — не вышло (нет сети) */
function check(): Promise<boolean> {
  running ??= (async () => {
    lastCheck = Date.now();
    try {
      const r = await ask('check');
      offlineReady.value = true;
      updateVersion.value = r.pending ?? null;
      return true;
    } catch {
      // нет сети или помощник ещё не готов — проверим позже
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Кнопка «Проверить обновления» на вкладке «Файл» */
export async function checkUpdates(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    checkState.value = 'unavailable';
    return;
  }
  checkState.value = 'checking';
  const ok = await check();
  checkState.value = !ok ? 'failed' : updateVersion.value ? 'found' : 'latest';
}

export function initOffline(): void {
  standalone.value = matchMedia('(display-mode: standalone)').matches;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt.value = e as InstallPrompt;
  });
  addEventListener('appinstalled', () => { installPrompt.value = null; });

  // на сервере разработки помощника нет: он мешал бы видеть правки сразу
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  sw.addEventListener('controllerchange', () => void check());
  sw.register('./sw.js', { updateViaCache: 'none' }).then(() => {
    if (sw.controller) void check();
    setInterval(() => void check(), CHECK_EVERY);
    addEventListener('online', () => void check());
    // телефон часто не перезапускает приложение, а возвращает его из фона — проверяем и тогда
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && sw.controller && Date.now() - lastCheck > CHECK_ON_RETURN) void check();
    });
  }, () => { /* без помощника приложение работает как обычный сайт */ });
}

/** Кнопка «Обновить»: сохранить работу, включить новую версию, перезапустить страницу */
export async function applyUpdate(saveWork: () => Promise<void>): Promise<void> {
  await saveWork();
  await ask('apply');
  reloadingForUpdate = true;
  location.reload();
}

export async function install(): Promise<void> {
  const p = installPrompt.value;
  if (!p) return;
  await p.prompt();
  installPrompt.value = null;
}
