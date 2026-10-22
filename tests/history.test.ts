// Правила истории состояний и текст индикатора «не сохранено в файл».
import { describe, expect, test } from 'vitest';
import { SNAPSHOT_EVERY_MS, saveStatusText, snapshotDue } from '../src/storage/history';

describe('когда сохранять состояние в историю', () => {
  const t0 = 1_000_000;
  test('без изменений — никогда', () => {
    expect(snapshotDue(false, null, t0)).toBe(false);
    expect(snapshotDue(false, t0, t0 + 10 * SNAPSHOT_EVERY_MS)).toBe(false);
  });

  test('первое изменение — сразу', () => {
    expect(snapshotDue(true, null, t0)).toBe(true);
  });

  test('не чаще раза в 5 минут', () => {
    expect(snapshotDue(true, t0, t0 + SNAPSHOT_EVERY_MS - 1)).toBe(false);
    expect(snapshotDue(true, t0, t0 + SNAPSHOT_EVERY_MS)).toBe(true);
  });
});

describe('индикатор в шапке', () => {
  const t0 = 1_000_000;
  test.each<[number | null, number | null, number, string]>([
    [null, null, t0, 'Ещё не сохранялся в файл'],
    [null, t0, t0, 'Сохранено в файл'],
    [t0, null, t0 + 30_000, 'Не сохранено в файл'],
    [t0, t0 - 1, t0 + 12 * 60_000 + 5_000, 'Не сохранено в файл 12 мин'],
  ])('изменено с %s, сохранено %s', (dirty, saved, now, text) => {
    expect(saveStatusText(dirty, saved, now)).toBe(text);
  });
});
