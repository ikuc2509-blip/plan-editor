// Сохранение через окно «Сохранить как» и автосохранение в выбранный файл
// (File System Access: Chrome и Edge на компьютере). Где его нет — обычное скачивание.
import { saveFile } from './files';

interface SavePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
type PermissionMode = { mode: 'readwrite' };
interface WritableHandle extends FileSystemFileHandle {
  queryPermission?(o: PermissionMode): Promise<PermissionState>;
  requestPermission?(o: PermissionMode): Promise<PermissionState>;
}
declare global {
  interface Window {
    showSaveFilePicker?: (o: SavePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

export const fsaSupported = (): boolean => typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

const OMP_TYPE = [{ description: 'Проект осмотра', accept: { 'application/octet-stream': ['.omp'] } }];

/**
 * Сохранить файл проекта. С окном выбора — возвращает файл для автосохранения;
 * null — пользователь закрыл окно. Без окна выбора — скачивание, возвращает 'download'.
 */
export async function saveProjectFile(name: string, bytes: Uint8Array): Promise<FileSystemFileHandle | 'download' | null> {
  if (!fsaSupported()) {
    saveFile(name, new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    return 'download';
  }
  let h: FileSystemFileHandle;
  try {
    h = await window.showSaveFilePicker!({ suggestedName: name, types: OMP_TYPE });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
  await writeHandle(h, bytes);
  return h;
}

export async function writeHandle(h: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const w = await h.createWritable();
  await w.write(bytes as BlobPart);
  await w.close();
}

/** Есть ли разрешение писать в файл; ask — спросить (только по нажатию кнопки) */
export async function canWrite(h: FileSystemFileHandle, ask: boolean): Promise<boolean> {
  const wh = h as WritableHandle;
  const o: PermissionMode = { mode: 'readwrite' };
  if ((await wh.queryPermission?.(o)) === 'granted') return true;
  return ask ? (await wh.requestPermission?.(o)) === 'granted' : false;
}
