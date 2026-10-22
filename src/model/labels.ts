import type { ItemType, Mm, WallItemType } from './types';

export const WI_TYPES: Record<WallItemType, string> = {
  window: 'Окно', door: 'Дверь', radiator: 'Радиатор', board: 'Доска', screen: 'Экран',
  picture: 'Картина', hanger: 'Вешалка', camera: 'Видеокамера', other: 'Другое',
};

export const IT_TYPES: Record<ItemType, string> = {
  desk: 'Стол (парта)', chair: 'Стул', teacher: 'Стол преподавателя', lectern: 'Кафедра (К)',
  table: 'Стол', cabinet: 'Шкаф', projector: 'Проектор (на потолке)',
  bed: 'Кровать', sofa: 'Диван', fridge: 'Холодильник', stove: 'Плита', bath: 'Ванна',
  sink: 'Раковина', toilet: 'Унитаз', column: 'Колонна', other: 'Другое',
};

/** Типовые размеры нового предмета: по X и по Y (изголовье, спинка, бачок — со стороны Y = 0) */
export const IT_SIZE: Record<ItemType, [Mm, Mm]> = {
  desk: [1200, 500], chair: [450, 450], teacher: [1400, 700], lectern: [600, 600],
  table: [1200, 800], cabinet: [1000, 600], projector: [400, 300], other: [800, 800],
  bed: [1600, 2000], sofa: [2000, 900], fridge: [600, 650], stove: [600, 600], bath: [1700, 750],
  sink: [500, 450], toilet: [400, 700], column: [400, 400],
};
