import type { ItemType, WallItemType } from './types';

export const WI_TYPES: Record<WallItemType, string> = {
  window: 'Окно', door: 'Дверь', radiator: 'Радиатор', board: 'Доска', screen: 'Экран',
  picture: 'Картина', hanger: 'Вешалка', camera: 'Видеокамера', other: 'Другое',
};

export const IT_TYPES: Record<ItemType, string> = {
  desk: 'Стол (парта)', chair: 'Стул', teacher: 'Стол преподавателя', lectern: 'Кафедра (К)',
  table: 'Стол', cabinet: 'Шкаф', projector: 'Проектор (на потолке)', other: 'Другое',
};
