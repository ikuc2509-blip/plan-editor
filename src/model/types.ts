// Модель плана, формат plan.json (версия — FORMAT_VERSION ниже).
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
  | { kind: 'photo'; photoId: string; box: PhotoBox; auto?: AutoFound };

/** Объект предложила модель распознавания, человек принял (формат 7, этап 10) */
export interface AutoFound {
  /** какая модель */
  model: string;
  /** уверенность модели, 0…1, две цифры после запятой */
  score: number;
}

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
  /** развёртка стены: скрыта или отнесена в сторону (формат 12, этап 12); нет — на месте */
  elev?: WallElev;
}

/** Где развёртка стены на листе: сдвиг от обычного места, мм в координатах пола */
export interface WallElev {
  hidden?: boolean;
  dx?: Mm;
  dy?: Mm;
}

export interface Room {
  walls: Wall[];
  height: Dim;
}

/**
 * Соседнее помещение (формат 10, этап 12): только на плане пола, без развёрток.
 * Стены — как у основного (по часовой); общая стена-перегородка — на стене основного помещения.
 */
export interface Annex {
  id: string;
  /** «подсобка», «санузел»…; пусто — «Помещение 2» */
  name: string;
  walls: Wall[];
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
  | 'cabinet' | 'projector' | 'other'
  // квартира (формат 3)
  | 'bed' | 'sofa' | 'fridge' | 'stove' | 'bath' | 'sink' | 'toilet' | 'column'
  // больше мебели и контур тела (формат 8)
  | 'armchair' | 'nightstand' | 'dresser' | 'shelf' | 'wardrobe' | 'writingDesk' | 'tv' | 'computer'
  | 'carpet' | 'mirror' | 'washer' | 'shower' | 'safe' | 'body';

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
  /** поворот вокруг центра, градусы по часовой стрелке, 0…360 */
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

/** Произвольная подпись со стрелкой-выноской */
export interface Callout {
  id: string;
  text: string;
  /** где подпись (левый конец полки), координаты пола; может быть за пределами помещения */
  at: Point;
  /** куда указывает стрелка, координаты пола */
  target: Point;
  origin: Origin;
}

/** Вид криминалистической съёмки; '' — ещё не выбран */
export type ShotKind = '' | 'orienting' | 'overview' | 'nodal' | 'detail';

/** К чему относится снимок */
export type PhotoLink = { kind: 'none' } | { kind: 'marker'; markerId: string } | { kind: 'wall'; wallId: string };

/**
 * Снимок осмотра. Сам файл (оригинал без изменений) хранится отдельно: в браузере
 * и в папке photos/ файла .omp под именем file.
 */
export interface Photo {
  id: string;
  /** номер как в фототаблице; приложение само не перенумеровывает */
  n: string;
  /** имя в photos/ — уникальное в проекте */
  file: string;
  /** исходное имя файла */
  name: string;
  /** MIME: image/jpeg и т. п. */
  type: string;
  /** байт */
  size: number;
  /** SHA-256 оригинала, hex — подтверждает неизменность с момента добавления */
  sha256: string;
  kind: ShotKind;
  link: PhotoLink;
  /** время съёмки из EXIF «2026-10-22T10:15:00» (местное время камеры); '' — нет */
  takenAt: string;
  /** в EXIF есть координаты (на лист не выводятся) */
  hasGps: boolean;
  /** когда добавлен в проект, ISO */
  addedAt: string;
  source: 'file' | 'camera';
  /** пункт списка съёмки, из которого снят: 'wall:A', 'marker:<id>:detail'… */
  shot: string;
  /** подпись в фототаблице после «Фото № N.»; '' — черновик приложения (формат 13) */
  caption: string;
  /** стрелки с номерами меток — рисуются поверх снимка только в фототаблице, оригинал не меняется (формат 13) */
  arrows: PhotoArrow[];
}

/** Стрелка на снимке: остриё (x, y) и хвост с номером (tx, ty) — доли ширины и высоты снимка; номер — метки */
export interface PhotoArrow {
  id: string;
  markerId: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
}

export interface Stamp {
  name: string;
  object: string;
  protocol: string;
  date: string;
  author: string;
  members: string;
}

/** Шапка фототаблицы (формат 13): ведомство и подразделение, его адрес, номер КУСП; '' — линия для руки */
export interface PhotoTableHead {
  /** до трёх строк, каждая с новой строки */
  org: string;
  orgAddress: string;
  kusp: string;
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

/** Названия приборов для строки «Замеры произведены…»; пусто — пустая строка для руки */
export interface Instruments {
  tape: string;
  rangefinder: string;
}

export type Paper = 'A3' | 'A4';

export interface SheetOptions {
  /** формат листа, альбомная ориентация */
  paper: Paper;
  mode: 'schematic' | 'scale';
  scale: number;
  showTies: boolean;
  /** чёрно-белый лист (для принтера без цвета); иначе — цветной, как образец (формат 11) */
  bw: boolean;
}

export const FORMAT_ID = 'plan-editor';
/**
 * История версий формата plan.json:
 * 1 — этап 1: модель в миллиметрах, стены-отрезки;
 * 2 — этап 2: формат листа (sheet.paper), убрана галочка sheet.showDims;
 * 3 — этап 5: предметы квартиры (кровать, диван, плита…), рисуется поворот предметов;
 * 4 — этап 6: названия приборов для замеров (instruments);
 * 5 — этап 7: снимки (файл, SHA-256, вид съёмки, привязка, время из EXIF);
 * 6 — этап 9: снимки, выпрямленные на развёртку стен (wallPhotos);
 * 7 — этап 10: у принятого объекта — «предложено моделью» и уверенность (origin.auto);
 * 8 — этап 11: больше мебели (кресло, тумба, комод…) и контур тела человека;
 * 9 — этап 12: комнаты может не быть (чистый лист) или она нарисована — любые стены-отрезки;
 * 10 — этап 12: соседние помещения (annexes) — на плане пола, развёртки только у основного;
 * 11 — этап 12: лист цветной, как образец, или чёрно-белый (sheet.bw);
 * 12 — этап 12: развёртку стены можно скрыть или отнести в сторону (wall.elev);
 * 13 — фототаблица: подпись снимка (photo.caption), стрелки на снимке (photo.arrows) и шапка (phototable).
 */
/** Точка на снимке, в долях ширины и высоты (0…1) */
export interface PhotoPt {
  x: number;
  y: number;
}

/** Край кадра на стене: угол стены или видимый ориентир (край окна и т. п.) на расстоянии от левого угла */
export type FrameEdge = { kind: 'corner' } | { kind: 'mark'; off: Dim };

/**
 * Снимок, выпрямленный на развёртку стены (этап 9). Хранятся только углы — ровная картинка
 * считается заново из оригинала (decisions.md). Верх кадра — потолок, низ — пол.
 */
export interface WallPhoto {
  id: string;
  photoId: string;
  wallId: string;
  /** углы участка стены на снимке: вверху слева, вверху справа, внизу справа, внизу слева */
  quad: PhotoPt[];
  /** левый край кадра: угол — начало стены (отступ 0); правый: угол — конец стены */
  left: FrameEdge;
  right: FrameEdge;
  show: boolean;
  opacity: number;
}

export const FORMAT_VERSION = 13;

export interface Plan {
  format: typeof FORMAT_ID;
  version: typeof FORMAT_VERSION;
  room: Room;
  wallItems: WallItem[];
  items: Item[];
  markers: Marker[];
  callouts: Callout[];
  photos: Photo[];
  /** снимки, выпрямленные на развёртку стен (этап 9) */
  wallPhotos: WallPhoto[];
  /** соседние помещения — на плане пола, без развёрток (этап 12) */
  annexes: Annex[];
  stamp: Stamp;
  /** шапка фототаблицы (формат 13) */
  phototable: PhotoTableHead;
  north: string;
  notes: string;
  instruments: Instruments;
  underlay: Underlay;
  sheet: SheetOptions;
}

export type SelKind = 'wi' | 'it' | 'mk' | 'co';
export interface Selection {
  kind: SelKind;
  id: string;
}
