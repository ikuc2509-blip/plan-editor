// Вся работа с файлами пользователя — здесь, чтобы при упаковке в APK/.exe менять один модуль.

/** Отдать файл пользователю (скачивание браузером) */
export function saveFile(filename: string, data: Blob | string, type = 'application/octet-stream'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // ссылку освобождаем не сразу: браузеру нужно время начать скачивание
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Выбор файла с диска; null — пользователь закрыл окно выбора */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** Выбор нескольких файлов (снимки); пустой список — окно закрыли */
export function pickFiles(accept: string): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

export function readText(f: File): Promise<string> {
  return f.text();
}

export function readDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}
