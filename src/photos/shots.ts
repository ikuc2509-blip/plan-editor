// Список съёмки по плану (decisions.md, этап 7): что снять и как. Без DOM.
import type { Photo, PhotoLink, Plan, ShotKind } from '../model/types';
import { findWall, wallsByLetter } from '../model/room';

export const SHOT_KINDS: Record<Exclude<ShotKind, ''>, string> = {
  orienting: 'ориентирующая', overview: 'обзорная', nodal: 'узловая', detail: 'детальная',
};

export const WALL_HINT = 'Встаньте у противоположной стены, посередине. Телефон прямо, на уровне груди. Камера 1× (не 0,5×). В кадре оба угла, пол и потолок. Длинную стену — несколькими кадрами: идите вдоль неё, каждый кадр перекрывает предыдущий примерно на треть.';

export interface ShotItem {
  key: string;
  title: string;
  hint: string;
  kind: Exclude<ShotKind, ''>;
  link: PhotoLink;
}

/** Углы прямоугольного помещения: пары стен */
const CORNERS: [string, string][] = [['A', 'V'], ['A', 'G'], ['B', 'G'], ['B', 'V']];

export function shotList(p: Plan): ShotItem[] {
  const L = (id: string) => findWall(p.room, id)?.letter ?? id;
  const items: ShotItem[] = [{
    key: 'orienting', title: 'Ориентирующая', kind: 'orienting', link: { kind: 'none' },
    hint: 'Здание и вход снаружи — так, чтобы было понятно, где находится помещение.',
  }];
  for (const [a, b] of CORNERS) {
    items.push({
      key: `overview:${a}${b}`, title: `Обзорная из угла ${L(a)}/${L(b)}`, kind: 'overview', link: { kind: 'none' },
      hint: 'Помещение целиком из угла по диагонали. Снимайте до того, как что-либо трогать.',
    });
  }
  for (const w of wallsByLetter(p.room)) {
    items.push({
      key: `wall:${w.id}`, title: `Стена ${w.letter}${w.name ? ' — ' + w.name : ''} целиком`, kind: 'overview',
      link: { kind: 'wall', wallId: w.id }, hint: WALL_HINT,
    });
  }
  for (const m of p.markers) {
    const link: PhotoLink = { kind: 'marker', markerId: m.id };
    items.push({
      key: `marker:${m.id}:nodal`, title: `Метка № ${m.n} — узловая`, kind: 'nodal', link,
      hint: 'Метка вместе с окружением: видно, где она относительно мебели и стен. Бирка с номером в кадре.',
    });
    items.push({
      key: `marker:${m.id}:detail`, title: `Метка № ${m.n} — детальная`, kind: 'detail', link,
      hint: 'Крупно, камера перпендикулярно поверхности. Рядом масштабная линейка и бирка с номером.',
    });
  }
  return items;
}

/** Снимки, сделанные по пункту списка */
export const shotPhotos = (p: Plan, key: string): Photo[] => p.photos.filter(ph => ph.shot === key);

/** Подпись привязки: «метка № 2», «стена А», «—» */
export function linkText(p: Plan, l: PhotoLink): string {
  if (l.kind === 'marker') {
    const m = p.markers.find(k => k.id === l.markerId);
    return m ? `метка № ${m.n}` : 'метка удалена';
  }
  if (l.kind === 'wall') return `стена ${findWall(p.room, l.wallId)?.letter ?? '?'}`;
  return '—';
}
