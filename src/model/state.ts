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
    wallItems: [], items: [], markers: [], callouts: [], photos: [],
    stamp: { name: 'План-схема места происшествия', object: '', protocol: '', date: '', author: '', members: '' },
    north: '', notes: '',
    underlay: { src: '', show: true, opacity: 0.45, scale: 100, dx: 0, dy: 0 },
    sheet: { paper: 'A3', mode: 'schematic', scale: 100, showTies: true },
  };
}

/** Учебная аудитория (ул. Широкая, 33) — из examples/ */
export function example(): Plan {
  return structuredClone(auditorium as unknown as Plan);
}
