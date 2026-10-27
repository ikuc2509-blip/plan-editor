import type { Plan } from './types';
import { FORMAT_ID, FORMAT_VERSION } from './types';
import { createRectRoom } from './room';
import auditorium from '../../examples/auditorium.plan.json';

export const uid = (): string => Math.random().toString(36).slice(2, 9);

export function blank(): Plan {
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    room: createRectRoom(10_000, 6_000, 3_000),
    wallItems: [], items: [], markers: [], callouts: [], photos: [], wallPhotos: [], annexes: [],
    stamp: { name: 'План-схема места происшествия', object: '', protocol: '', date: '', author: '', members: '' },
    phototable: { org: '', orgAddress: '', kusp: '' },
    north: '', notes: '',
    instruments: { tape: '', rangefinder: '' },
    underlay: { src: '', show: true, opacity: 0.45, scale: 100, dx: 0, dy: 0 },
    sheet: { paper: 'A3', mode: 'schematic', scale: 100, showTies: true, bw: false },
  };
}

/** Чистый лист (этап 12): комнаты нет — её рисуют или берут заготовку */
export function emptyPlan(): Plan {
  const p = blank();
  return { ...p, room: { walls: [], height: p.room.height } };
}

/** Учебная аудитория (ул. Широкая, 33) — из examples/ */
export function example(): Plan {
  return structuredClone(auditorium as unknown as Plan);
}
