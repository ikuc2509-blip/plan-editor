// Правила истории состояний (decisions.md): 20 последних, раз в 5 минут при изменениях.

export const HISTORY_MAX = 20;
export const SNAPSHOT_EVERY_MS = 5 * 60_000;

/** Пора ли сохранить состояние в историю по таймеру */
export function snapshotDue(changedSinceLast: boolean, lastAt: number | null, now: number): boolean {
  if (!changedSinceLast) return false;
  return lastAt === null || now - lastAt >= SNAPSHOT_EVERY_MS;
}

/** «не сохранено в файл 12 мин» — текст индикатора в шапке */
export function saveStatusText(dirtySince: number | null, fileSavedAt: number | null, now: number): string {
  if (dirtySince === null) return fileSavedAt === null ? 'Ещё не сохранялся в файл' : 'Сохранено в файл';
  const min = Math.floor((now - dirtySince) / 60_000);
  return min < 1 ? 'Не сохранено в файл' : `Не сохранено в файл ${min} мин`;
}
