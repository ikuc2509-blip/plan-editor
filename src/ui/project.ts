// Действия с файлом проекта: сохранить, открыть, пароль, автосохранение в выбранный файл.
import { signal } from '@preact/signals';
import { loadPlan } from '../model/migrate';
import { looksLikeZip, readOmp, writeOmp, type ProjectMeta } from '../storage/omp';
import { projectFileName } from '../storage/naming';
import { pickFile } from '../storage/files';
import { canWrite, fsaSupported, saveProjectFile, writeHandle } from '../storage/fsa';
import { getFileHandle, setFileHandle } from '../storage/db';
import { askPassword } from './common/PasswordDialog';
import { markSavedToFile, meta, password, persistWork, plan, planChanged, protect, replacePlan, toast } from './store';
import { checkPhotos } from '../photos/meta';
import { clearPhotos, importPhotos, photoFiles } from './photos';

export type AutosaveState = 'on' | 'needs-permission' | 'needs-password' | 'error';
/** автосохранение в файл: имя файла и состояние; null — выключено */
export const autosave = signal<{ name: string; state: AutosaveState } | null>(null);
let handle: FileSystemFileHandle | null = null;

async function ensurePassword(): Promise<string | null> {
  if (!protect.value) return null;
  if (password.value) return password.value;
  const pw = await askPassword('set', 'Пароль для файла проекта');
  if (pw) password.value = pw;
  return pw;
}

/** «Сохранить в файл»: следующий номер сохранения, окно «Сохранить как» или скачивание */
export async function saveToFile(): Promise<void> {
  const pw = await ensurePassword();
  if (protect.value && !pw) return;
  const m: ProjectMeta = { ...meta.value, modified: new Date().toISOString(), saveNumber: meta.value.saveNumber + 1 };
  const name = projectFileName(plan.value, m.saveNumber, protect.value);
  try {
    const bytes = await writeOmp({ plan: plan.value, meta: m, photos: await photoFiles(plan.value) }, pw ?? undefined);
    const res = await saveProjectFile(name, bytes);
    if (!res) return; // окно закрыли — номер не тратим
    markSavedToFile(m);
    if (res !== 'download') {
      handle = res;
      await setFileHandle(res);
      autosave.value = { name: res.name, state: 'on' };
      toast(`Сохранено: ${res.name}. Дальше изменения будут записываться в этот файл автоматически.`);
    } else {
      toast('Файл сохранён: ' + name);
    }
  } catch (e) {
    toast('Не удалось сохранить файл: ' + (e instanceof Error ? e.message : 'ошибка'));
  }
}

/** «Открыть файл»: .omp (в т. ч. с паролем) или старый .json */
export async function openFile(): Promise<void> {
  const f = await pickFile('.omp,.json,application/json');
  if (!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (!looksLikeZip(bytes)) return openJson(bytes);

  let pw: string | undefined;
  let r = await readOmp(bytes);
  while (!r.ok && (r.reason === 'need-password' || r.reason === 'wrong-password')) {
    const entered = await askPassword('enter', `Пароль к файлу ${f.name}`, r.reason === 'wrong-password' ? r.error : undefined);
    if (!entered) return;
    pw = entered;
    r = await readOmp(bytes, pw);
  }
  if (!r.ok) { toast(r.error); return; }
  // отпечатки снимков: не изменились ли они с момента добавления в проект
  const check = await checkPhotos(r.content.plan.photos, r.content.photos);
  await stopAutosave();
  await importPhotos(r.content.plan, r.content.photos);
  await replacePlan(r.content.plan, { label: 'открытия файла', meta: r.content.meta, saved: true });
  protect.value = r.encrypted;
  password.value = pw ?? null;
  persistWork(true);
  const warn = [
    check.changed.length ? `Снимки № ${check.changed.join(', ')} изменены после добавления в проект (отпечаток SHA-256 не совпал).` : '',
    check.missing.length ? `В файле нет снимков № ${check.missing.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  if (warn) alert(warn);
  toast(r.migratedFrom ? 'Проект открыт и переведён в новый формат' : 'Проект открыт: ' + f.name);
}

async function openJson(bytes: Uint8Array): Promise<void> {
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch { toast('Это не файл проекта (.omp или .json)'); return; }
  const r = loadPlan(raw);
  if (!r.ok) { toast(r.error); return; }
  await stopAutosave();
  await clearPhotos();
  // старый JSON — в .omp ещё не сохранён
  await replacePlan(r.plan, { label: 'открытия файла', dirty: true });
  toast('Старый проект открыт. Сохраните его в файл .omp.');
}

/** Включить или выключить пароль для следующих сохранений */
export async function setProtect(on: boolean): Promise<void> {
  if (on) {
    const pw = await askPassword('set', 'Пароль для файла проекта');
    if (!pw) return;
    password.value = pw;
  } else {
    password.value = null;
  }
  protect.value = on;
  persistWork(true);
  if (autosave.value) await autosaveNow();
}

export async function changePassword(): Promise<void> {
  const pw = await askPassword('set', 'Новый пароль для файла проекта');
  if (!pw) return;
  password.value = pw;
  if (autosave.value) await autosaveNow();
}

/* автосохранение (Windows, Chrome/Edge) */

export async function initAutosave(): Promise<void> {
  if (!fsaSupported()) return;
  handle = await getFileHandle();
  if (!handle) return;
  autosave.value = { name: handle.name, state: (await canWrite(handle, false)) ? 'on' : 'needs-permission' };
}

/** Кнопка «Продолжить автосохранение»: разрешение на запись и, если нужно, пароль */
export async function resumeAutosave(): Promise<void> {
  if (!handle) return;
  if (!(await canWrite(handle, true))) { autosave.value = { name: handle.name, state: 'needs-permission' }; return; }
  if (protect.value && !password.value) {
    const pw = await askPassword('enter', `Пароль к файлу ${handle.name}`);
    if (!pw) { autosave.value = { name: handle.name, state: 'needs-password' }; return; }
    password.value = pw;
  }
  autosave.value = { name: handle.name, state: 'on' };
  await autosaveNow();
}

export async function stopAutosave(): Promise<void> {
  handle = null;
  autosave.value = null;
  await setFileHandle(null);
}

let busy = false;
async function autosaveNow(): Promise<void> {
  if (!handle || autosave.value?.state !== 'on' || busy) return;
  if (protect.value && !password.value) { autosave.value = { name: handle.name, state: 'needs-password' }; return; }
  busy = true;
  try {
    // номер сохранения не меняется: пишем в тот же файл
    const m: ProjectMeta = { ...meta.value, modified: new Date().toISOString() };
    await writeHandle(handle, await writeOmp({ plan: plan.value, meta: m, photos: await photoFiles(plan.value) }, password.value ?? undefined));
    markSavedToFile(m);
  } catch {
    autosave.value = { name: handle.name, state: (await canWrite(handle, false)) ? 'error' : 'needs-permission' };
  } finally {
    busy = false;
  }
}

let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
planChanged.add(() => {
  if (autosave.value?.state !== 'on') return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => void autosaveNow(), 3000);
});
