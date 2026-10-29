// Что не доделано перед «Осмотр завершён»: список с указанием шага, где это поправить. Без DOM.
import type { Plan } from './types';
import { measureList } from './measure';
import { noRoom } from './room';

/** шаг режима «На месте», где поправить */
export type GapWhere = 'room' | 'markers' | 'photos' | 'measure' | 'finish';
export interface Gap { text: string; where: GapWhere }

/** не больше трёх строк одного рода, остальное — «и ещё N» */
function few(list: string[], more: (n: number) => string): string[] {
  return list.length > 3 ? [...list.slice(0, 2), more(list.length - 2)] : list;
}

export function inspectionGaps(p: Plan): Gap[] {
  const out: Gap[] = [];
  if (noRoom(p.room)) out.push({ text: 'Комната не нарисована', where: 'room' });
  const st = p.stamp;
  const empty = [!st.object.trim() && 'адрес', !st.date.trim() && 'дата', !st.timeStart.trim() && 'время начала', !st.author.trim() && '«Составил»'].filter((s): s is string => !!s);
  if (empty.length) out.push({ text: `Для штампа не заполнено: ${empty.join(', ')}`, where: 'room' });
  if (!st.timeEnd.trim()) out.push({ text: 'Не указано время окончания осмотра', where: 'finish' });

  const noDesc = p.markers.filter(m => !m.desc.trim()).map(m => `Метка № ${m.n} — нет описания`);
  for (const text of few(noDesc, n => `Ещё ${n} меток без описания`)) out.push({ text, where: 'markers' });
  const shot = new Set(p.photos.flatMap(ph => [...(ph.link.kind === 'marker' ? [ph.link.markerId] : []), ...ph.arrows.map(a => a.markerId)]));
  const noPhoto = p.markers.filter(m => !shot.has(m.id)).map(m => `Метка № ${m.n} — нет снимка`);
  for (const text of few(noPhoto, n => `Ещё ${n} меток без снимка`)) out.push({ text, where: 'photos' });

  if (!p.photos.some(ph => ph.kind === 'orienting')) out.push({ text: 'Нет ориентирующего снимка (здание, вход)', where: 'photos' });
  const seen = new Map<string, number>();
  for (const ph of p.photos) seen.set(ph.n.trim(), (seen.get(ph.n.trim()) ?? 0) + 1);
  for (const [n, k] of seen) if (k > 1) out.push({ text: n ? `Номер снимка ${n} повторяется (${k} раза)` : 'Есть снимки без номера', where: 'photos' });

  const rows = measureList(p), todo = rows.filter(r => r.dim.status !== 'measured').length;
  if (todo) out.push({ text: `Не замерено: ${todo} из ${rows.length} (на листе — пустые строки «____ м»)`, where: 'measure' });
  return out;
}
