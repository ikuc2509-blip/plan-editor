import type { ItemType, Mm, WallItemType } from './types';

export const WI_TYPES: Record<WallItemType, string> = {
  window: 'Окно', door: 'Дверь', radiator: 'Радиатор', board: 'Доска', screen: 'Экран',
  picture: 'Картина', hanger: 'Вешалка', camera: 'Видеокамера', other: 'Другое',
};

export const IT_TYPES: Record<ItemType, string> = {
  desk: 'Стол (парта)', chair: 'Стул', teacher: 'Стол преподавателя', lectern: 'Кафедра (К)',
  table: 'Стол', cabinet: 'Шкаф', projector: 'Проектор (на потолке)',
  bed: 'Кровать', sofa: 'Диван', fridge: 'Холодильник', stove: 'Плита', bath: 'Ванна',
  sink: 'Раковина', toilet: 'Унитаз', column: 'Колонна',
  // формат 8
  armchair: 'Кресло', nightstand: 'Тумба', dresser: 'Комод', shelf: 'Стеллаж', wardrobe: 'Шкаф-купе',
  writingDesk: 'Письменный стол', tv: 'Телевизор', computer: 'Компьютер', carpet: 'Ковёр', mirror: 'Зеркало',
  washer: 'Стиральная машина', shower: 'Душевая кабина', safe: 'Сейф', body: 'Контур тела человека',
  other: 'Другое',
};

/** Типовые размеры нового предмета: по X и по Y (изголовье, спинка, бачок — со стороны Y = 0) */
export const IT_SIZE: Record<ItemType, [Mm, Mm]> = {
  desk: [1200, 500], chair: [450, 450], teacher: [1400, 700], lectern: [600, 600],
  table: [1200, 800], cabinet: [1000, 600], projector: [400, 300], other: [800, 800],
  bed: [1600, 2000], sofa: [2000, 900], fridge: [600, 650], stove: [600, 600], bath: [1700, 750],
  sink: [500, 450], toilet: [400, 700], column: [400, 400],
  armchair: [800, 800], nightstand: [450, 400], dresser: [1000, 500], shelf: [900, 400], wardrobe: [1800, 600],
  writingDesk: [1200, 600], tv: [1100, 250], computer: [600, 500], carpet: [2000, 1500], mirror: [800, 80],
  // голова — со стороны Y = 0
  washer: [600, 600], shower: [900, 900], safe: [500, 500], body: [600, 1800],
};
