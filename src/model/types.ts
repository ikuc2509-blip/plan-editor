// Данные плана в формате прототипа (длины в метрах, дробные).
// Временный формат этапа 0; на этапе 1 его заменит новая модель с миграцией.

export type WallKey = 'A' | 'B' | 'V' | 'G';

export type WallItemType =
  | 'window' | 'door' | 'radiator' | 'board' | 'screen'
  | 'picture' | 'hanger' | 'camera' | 'other';

export type ItemType =
  | 'desk' | 'chair' | 'teacher' | 'lectern' | 'table'
  | 'cabinet' | 'projector' | 'other';

export type MarkerPlace = 'floor' | 'wall' | 'outside';

export interface Room {
  L: number;
  W: number;
  h: number;
  mode: 'schematic' | 'scale';
  scale: number;
  showDims: boolean;
  showTies: boolean;
}

/** Элемент на стене: проём, радиатор, доска и т. п. */
export interface WallItem {
  id: string;
  wall: WallKey;
  type: WallItemType;
  label: string;
  /** отступ от левого края стены на развёртке */
  off: number;
  /** высота низа элемента от пола */
  z: number;
  w: number;
  h: number;
  open: boolean;
  hinge: 'start' | 'end';
}

/** Предмет на полу */
export interface Item {
  id: string;
  type: ItemType;
  label: string;
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface Marker {
  id: string;
  n: string;
  desc: string;
  place: MarkerPlace;
  x: number;
  y: number;
  wall: WallKey;
  off: number;
  z: number;
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
  src: string;
  show: boolean;
  opacity: number;
  scale: number;
  dx: number;
  dy: number;
}

export interface PlanState {
  room: Room;
  wallNames: Record<WallKey, string>;
  wallItems: WallItem[];
  items: Item[];
  markers: Marker[];
  stamp: Stamp;
  north: string;
  notes: string;
  underlay: Underlay;
}

export type SelKind = 'wi' | 'it' | 'mk';
export interface Selection {
  kind: SelKind;
  id: string;
}
