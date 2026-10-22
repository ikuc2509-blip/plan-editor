import type { ItemType, WallItemType, WallKey } from './types';

export const WALLS: Record<WallKey, string> = { A: 'А', B: 'Б', V: 'В', G: 'Г' };
export const WALL_KEYS: WallKey[] = ['A', 'B', 'V', 'G'];

export const WI_TYPES: Record<WallItemType, string> = {
  window: 'Окно', door: 'Дверь', radiator: 'Радиатор', board: 'Доска', screen: 'Экран',
  picture: 'Картина', hanger: 'Вешалка', camera: 'Видеокамера', other: 'Другое',
};

export const IT_TYPES: Record<ItemType, string> = {
  desk: 'Стол (парта)', chair: 'Стул', teacher: 'Стол преподавателя', lectern: 'Кафедра (К)',
  table: 'Стол', cabinet: 'Шкаф', projector: 'Проектор (на потолке)', other: 'Другое',
};
