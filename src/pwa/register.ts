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

async function check(): Promise<void> {
  try {
    const r = await ask('check');
    offlineReady.value = true;
    updateVersion.value = r.pending ?? null;
  } catch {
    // нет сети или помощник ещё не готов — проверим позже
  }
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
