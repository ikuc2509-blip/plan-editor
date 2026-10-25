// Что ищет модель (этап 10): окно, дверь, радиатор, доска, экран. Модель понимает только
// английский, поэтому запросы зашиты здесь; пользователь видит русские названия.
// Номера слов посчитаны scripts/clip-tokens.mjs по словарю модели.
import type { WallItemType } from '../model/types';

export interface Query {
  type: WallItemType;
  text: string;
  ids: number[];
}

export const QUERIES: readonly Query[] = [
  { type: 'window', text: 'a photo of a window', ids: [49406, 320, 1125, 539, 320, 4879, 49407] },
  { type: 'door', text: 'a photo of a door', ids: [49406, 320, 1125, 539, 320, 2489, 49407] },
  { type: 'radiator', text: 'a photo of a radiator', ids: [49406, 320, 1125, 539, 320, 39372, 49407] },
  // доска бывает и меловая, и маркерная — несколько запросов на один вид
  { type: 'board', text: 'a photo of a blackboard', ids: [49406, 320, 1125, 539, 320, 2025, 1972, 49407] },
  { type: 'board', text: 'a photo of a whiteboard', ids: [49406, 320, 1125, 539, 320, 40839, 49407] },
  { type: 'board', text: 'a photo of a chalkboard', ids: [49406, 320, 1125, 539, 320, 31362, 1972, 49407] },
  { type: 'screen', text: 'a photo of a projection screen', ids: [49406, 320, 1125, 539, 320, 22384, 3750, 49407] },
];

/** длина запроса у модели; короче — дополняется нулями */
export const TEXT_LEN = 16;
