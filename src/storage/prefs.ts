// Настройки интерфейса этого браузера (не данные осмотра): в файл проекта не попадают.

const PREFIX = 'plan-editor:pref:';

export function loadPref<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) {
      const v: unknown = JSON.parse(raw);
      if (valid(v)) return v;
    }
  } catch { /* хранилище недоступно — значение по умолчанию */ }
  return fallback;
}

export function savePref(key: string, v: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(v));
  } catch { /* не запомнится до следующего запуска — не страшно */ }
}
