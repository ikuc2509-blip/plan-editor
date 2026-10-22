// Имя файла проекта по умолчанию: ОМП_2026-10-22_Широкая-33_03.omp
// (дата осмотра + объект + номер сохранения). С паролем — без объекта, чтобы адрес
// не читался с флешки (decisions.md).
import type { Plan } from '../model/types';

/** «22.10.2026» → «2026-10-22»; нет даты — сегодня */
export function isoDate(stampDate: string, now = new Date()): string {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(stampDate);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Короткое имя объекта: «Аудитория, ул. Широкая, 33» → «Широкая-33» */
export function objectSlug(object: string): string {
  const street = /(?:ул|улица|пр|просп|проспект|пер|переулок|ш|шоссе|наб|бул|бульвар|пл|площадь)\.?\s+([^,]+?),\s*(?:д\.?\s*)?(\d+[\wа-яё/-]*)/iu.exec(object);
  const raw = street ? `${street[1]} ${street[2]}` : object;
  return raw
    .replace(/[\\/:*?"<>|.,;«»()]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export function projectFileName(plan: Plan, saveNumber: number, encrypted: boolean, now = new Date()): string {
  const parts = ['ОМП', isoDate(plan.stamp.date, now)];
  const slug = encrypted ? '' : objectSlug(plan.stamp.object);
  if (slug) parts.push(slug);
  parts.push(String(saveNumber).padStart(2, '0'));
  return parts.join('_') + '.omp';
}
