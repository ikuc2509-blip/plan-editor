// Ввод и вывод длин. Внутри — целые миллиметры, для человека — метры с запятой.
import type { Dim, Mm } from './types';

export type ParseResult = { ok: true; mm: Mm } | { ok: false; error: string };

const UNITS: Record<string, number> = {
  '': 1000, 'м': 1000, 'm': 1000,
  'см': 10, 'cm': 10,
  'мм': 1, 'mm': 1,
};

/** Больше 1 км — почти наверняка опечатка */
const MAX_MM = 1_000_000;

/**
 * Разобрать длину: «1,25», «1.25», «1,25 м», «125 см», «1250 мм».
 * Число без единиц — метры.
 */
export function parseLength(text: string): ParseResult {
  // пробелы (в т. ч. неразрывные) внутри числа — разделители тысяч: «1 250 мм»
  const t = text.trim().toLowerCase().replace(/[\s ]+/g, ' ');
  if (!t) return { ok: false, error: 'Введите число' };
  const m = /^(-?)((?:\d+ )*\d*[.,]?\d*) ?([a-zа-яё.]*)$/u.exec(t);
  const unit = m?.[3]?.replace(/\.$/, '') ?? '';
  const digits = m?.[2]?.replace(/ /g, '').replace(',', '.') ?? '';
  if (!m || !/\d/.test(digits) || !(unit in UNITS)) {
    return { ok: false, error: 'Не понял число. Пример: 1,25 или 125 см' };
  }
  const mm = Math.round(parseFloat(digits) * UNITS[unit]!) * (m[1] ? -1 : 1);
  if (Math.abs(mm) > MAX_MM) return { ok: false, error: 'Слишком большое значение' };
  return { ok: true, mm: mm === 0 ? 0 : mm };
}

/** Миллиметры → метры с запятой без лишних нулей: 1250 → «1,25», 3000 → «3» */
export function formatMeters(mm: Mm): string {
  const sign = mm < 0 ? '-' : '';
  const a = Math.abs(Math.round(mm));
  const whole = Math.floor(a / 1000);
  const frac = String(a % 1000).padStart(3, '0').replace(/0+$/, '');
  return sign + whole + (frac ? ',' + frac : '');
}

export const toM = (mm: Mm): number => mm / 1000;
export const toMm = (m: number): Mm => Math.round(m * 1000);

/** Новый условный размер */
export const cond = (mm: Mm): Dim => ({ mm: Math.round(mm), status: 'conditional' });

/** Поменять значение, сохранив статус и способ замера */
export const withMm = (d: Dim, mm: Mm): Dim => ({ ...d, mm: Math.round(mm) });
