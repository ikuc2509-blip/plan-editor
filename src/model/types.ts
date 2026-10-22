// Модель плана, формат plan.json версии 1.
// Все длины — в миллиметрах, целыми числами. Координаты пола: начало — угол между
// стенами А и В (левый верхний на листе), X — вдоль стены А, Y — вдоль стены В.

/** Миллиметры, целое число */
export type Mm = number;

export type DimStatus = 'conditional' | 'measured';
export type MeasureMethod = 'tape' | 'rangefinder' | 'ar';

/** Размер: значение + «условно / замерено»; у замеренного — чем мерили */
export interface Dim {
  mm: Mm;
  status: DimStatus;
  method?: MeasureMethod;
}

/** Рамка на снимке, в долях ширины и высоты снимка (0…1) */
export interface PhotoBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Откуда взялся объект */
export type Origin =
  | { kind: 'manual' }
  | { kind: 'photo'; photoId: string; box: PhotoBox };

export interface Point {
  x: Mm;
  y: Mm;
}

/**
 * Стена — отрезок от a до b. Стены идут по часовой стрелке на плане,
 * поэтому помещение всегда справа от направления a → b.
 * Отступ по стене считается от a — левого угла, если стоять лицом к стене.
 */
export interface Wall {
  id: string;
  /** буква на листе: А, Б, В, Г */
  letter: string;
  /** «оконная», «с дверями»… */
  name: string;
  a: Point;
  b: Point;
  /** длина стены; совпадает с расстоянием a–b */
  length: Dim;
}

export interface Room {
  walls: Wall[];
  height: Dim;
}

export type WallItemType =
  | 'window' | 'door' | 'radiator' | 'board' | 'screen'
  | 'picture' | 'hanger' | 'camera' | 'other';

/** Проёмы прорезают стену на плане пола; остальное — элементы стены */
export const OPENING_TYPES: readonly WallItemType[] = ['window', 'door'];

/** Проём или элемент на стене */
export interface WallItem {
  id: string;
  wallId: string;
  type: WallItemType;
  label: string;
  /** от начала стены до ближнего края элемента */
  off: Dim;
  /** от пола до низа элемента */
  z: Dim;
  w: Dim;
  h: Dim;
  /** створка открыта (окно) */
  open: boolean;
  /** петли у начала или у конца проёма (по направлению стены) */
  hinge: 'start' | 'end';
  origin: Origin;
}

export type ItemType =
  | 'desk' | 'chair' | 'teacher' | 'lectern' | 'table'
  | 'cabinet' | 'projector' | 'other';

/** Предмет на полу */
export interface Item {
  id: string;
  type: ItemType;
  label: string;
  x: Dim;
  y: Dim;
  /** размер по X */
  w: Dim;
  /** размер по Y */
  d: Dim;
  /** поворот, градусы по часовой стрелке (рисуется с этапа 5) */
  angle: number;
  origin: Origin;
}

export type MarkerPlace = 'floor' | 'wall' | 'outside';

export interface Marker {
  id: string;
  /** номер как в протоколе; приложение само не перенумеровывает */
  n: string;
  desc: string;
  place: MarkerPlace;
  /** на полу */
  x: Dim;
  y: Dim;
  /** на стене и снаружи */
  wallId: string;
  off: Dim;
  z: Dim;
  origin: Origin;
}

/** Произвольная подпись со стрелкой (рисуется с этапа 5) */
export interface Callout {
  id: string;
  text: string;
  /** где подпись, координаты пола */
  at: Point;
  /** куда указывает стрелка */
  target: Point;
  origin: Origin;
}

/** Снимок осмотра — заготовка, наполняется на этапе 7 */
export interface Photo {
  id: string;
  n: string;
}

export interface Stamp {
  name: string;
  object: string;
  protocol: string;
  date: string;
  author: string;
  members: string;
}

export interface Underlay {
  /** картинка data: URL */
  src: string;
  show: boolean;
  opacity: number;
  /** проценты */
  scale: number;
  dx: Mm;
  dy: Mm;
}

export type Paper = 'A3' | 'A4';

export interface SheetOptions {
  /** формат листа, альбомная ориентация */
  paper: Paper;
  mode: 'schematic' | 'scale';
  scale: number;
  showTies: boolean;
}

export const FORMAT_ID = 'plan-editor';
/**
 * История версий формата plan.json:
 * 1 — этап 1: модель в миллиметрах, стены-отрезки;
 * 2 — этап 2: формат листа (sheet.paper), убрана галочка sheet.showDims.
 */
export const FORMAT_VERSION = 2;

export interface Plan {
  format: typeof FORMAT_ID;
  version: typeof FORMAT_VERSION;
  room: Room;
  wallItems: WallItem[];
  items: Item[];
  markers: Marker[];
  callouts: Callout[];
  photos: Photo[];
  stamp: Stamp;
  north: string;
  notes: string;
  underlay: Underlay;
  sheet: SheetOptions;
}

export type SelKind = 'wi' | 'it' | 'mk';
export interface Selection {
  kind: SelKind;
  id: string;
}
