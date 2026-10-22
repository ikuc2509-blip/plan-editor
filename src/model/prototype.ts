// Формат проекта прототипа (JSON без номера версии, длины в метрах).
// Нужен только для перевода старых файлов — см. migrate.ts.

export type ProtoWall = 'A' | 'B' | 'V' | 'G';

export interface ProtoWallItem {
  id: string;
  wall: ProtoWall;
  type: string;
  label: string;
  off: number;
  z: number;
  w: number;
  h: number;
  open: boolean;
  hinge: 'start' | 'end';
}

export interface ProtoItem {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface ProtoMarker {
  id: string;
  n: string;
  desc: string;
  place: 'floor' | 'wall' | 'outside';
  x: number;
  y: number;
  wall: ProtoWall;
  off: number;
  z: number;
}

export interface ProtoPlan {
  room: { L: number; W: number; h: number; mode: 'schematic' | 'scale'; scale: number; showDims: boolean; showTies: boolean };
  wallNames: Record<ProtoWall, string>;
  wallItems: ProtoWallItem[];
  items: ProtoItem[];
  markers: ProtoMarker[];
  stamp: { name: string; object: string; protocol: string; date: string; author: string; members: string };
  north: string;
  notes: string;
  underlay?: { src: string; show: boolean; opacity: number; scale: number; dx: number; dy: number };
}
