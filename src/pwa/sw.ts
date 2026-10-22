// Service worker — фоновый помощник браузера: отдаёт файлы приложения без сети.
// Файлы каждой версии лежат в своём хранилище. Какая версия работает, меняет только
// кнопка «Обновить» (CLAUDE.md, правило 5): новая скачивается в фоне и ждёт.
import { LIST_FILE, cacheKeyFor, cacheName, fingerprint, staleCaches, type AppFiles } from './precache';

// в проекте подключены типы страницы, а не воркера — нужное описываем сами
interface ExtendableEvent extends Event { waitUntil(p: Promise<unknown>): void }
interface FetchEvent extends ExtendableEvent { request: Request; respondWith(r: Promise<Response>): void }
interface MsgEvent extends ExtendableEvent { data: unknown; ports: readonly MessagePort[] }
interface Scope {
  registration: { scope: string };
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(t: 'install' | 'activate', f: (e: ExtendableEvent) => void): void;
  addEventListener(t: 'fetch', f: (e: FetchEvent) => void): void;
  addEventListener(t: 'message', f: (e: MsgEvent) => void): void;
}

/** Ответ странице */
export interface SwReply { current?: string; pending?: string; error?: string }

const sw = self as unknown as Scope;
const base = sw.registration.scope;
const basePath = new URL(base).pathname;
/** current — работающая версия, pending — скачанная и ждущая кнопки */
const STATE = 'omp-state';
type Slot = 'current' | 'pending';

async function getSlot(s: Slot): Promise<AppFiles | null> {
  const r = await (await caches.open(STATE)).match(base + '__state/' + s);
  return r ? (await r.json()) as AppFiles : null;
}

async function setSlot(s: Slot, v: AppFiles | null): Promise<void> {
  const c = await caches.open(STATE);
  if (v) await c.put(base + '__state/' + s, new Response(JSON.stringify(v)));
  else await c.delete(base + '__state/' + s);
}

/** Скачать список и недостающие файлы последней версии с адреса приложения */
async function download(): Promise<AppFiles> {
  const res = await fetch(base + LIST_FILE, { cache: 'no-store' });
  if (!res.ok) throw new Error('нет списка файлов');
  const list = (await res.json()) as AppFiles;
  const cache = await caches.open(cacheName(list.build));
  for (const f of list.files) {
    if (await cache.match(base + f)) continue;
    // мимо кэша браузера: index.html и значки без отпечатка в имени
    const r = await fetch(base + f, { cache: 'reload' });
    if (!r.ok) throw new Error('не скачан ' + f);
    // страница могла смениться между списком и скачиванием (выкладка новой версии)
    if (f === 'index.html' && fingerprint(await r.clone().text()) !== list.indexHash) throw new Error('index.html другой сборки');
    await cache.put(base + f, r);
  }
  return list;
}

async function cleanup(): Promise<void> {
  const keep = [(await getSlot('current'))?.build ?? null, (await getSlot('pending'))?.build ?? null];
  for (const n of staleCaches(await caches.keys(), keep)) await caches.delete(n);
}

async function handle(type: unknown): Promise<SwReply> {
  if (type === 'check') {
    const list = await download();
    const cur = await getSlot('current');
    if (!cur) await setSlot('current', list);
    else if (cur.build !== list.build) await setSlot('pending', list);
    else await setSlot('pending', null);
    await cleanup();
  } else if (type === 'apply') {
    const p = await getSlot('pending');
    if (p) {
      await setSlot('current', p);
      await setSlot('pending', null);
    }
  }
  return { current: (await getSlot('current'))?.version, pending: (await getSlot('pending'))?.version };
}

sw.addEventListener('install', e => {
  // первая установка: запомнить файлы версии, которая сейчас открыта
  e.waitUntil((async () => {
    if (!(await getSlot('current'))) await setSlot('current', await download());
    // смена самого помощника версию приложения не меняет — ждать незачем
    await sw.skipWaiting();
  })());
});

sw.addEventListener('activate', e => e.waitUntil(sw.clients.claim()));

async function serve(req: Request, path: string): Promise<Response> {
  const cur = await getSlot('current');
  const key = cur && cacheKeyFor(path, req.mode === 'navigate', cur.files);
  if (cur && key) {
    const hit = await (await caches.open(cacheName(cur.build))).match(base + key);
    if (hit) return hit;
  }
  return fetch(req);
}

sw.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(base)) return;
  e.respondWith(serve(req, new URL(req.url).pathname.slice(basePath.length)));
});

sw.addEventListener('message', e => {
  const port = e.ports[0];
  if (!port) return;
  const type = (e.data as { type?: unknown } | null)?.type;
  e.waitUntil(handle(type).then(
    r => port.postMessage(r),
    (err: unknown) => port.postMessage({ error: err instanceof Error ? err.message : String(err) } satisfies SwReply),
  ));
});
