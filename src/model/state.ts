import type { PlanState, Underlay } from './types';
import auditorium from '../../examples/auditorium.prototype.json';

export const uid = (): string => Math.random().toString(36).slice(2, 9);

export function blankUnderlay(): Underlay {
  return { src: '', show: true, opacity: 0.45, scale: 100, dx: 0, dy: 0 };
}

export function blank(): PlanState {
  return {
    room: { L: 10, W: 6, h: 3, mode: 'schematic', scale: 100, showDims: true, showTies: true },
    wallNames: { A: '', B: '', V: '', G: '' }, wallItems: [], items: [], markers: [],
    stamp: { name: 'План-схема места происшествия', object: '', protocol: '', date: '', author: '', members: '' },
    north: '', notes: '', underlay: blankUnderlay(),
  };
}

/** Учебная аудитория (ул. Широкая, 33) — из examples/ */
export function example(): PlanState {
  return structuredClone(auditorium as PlanState);
}

export interface RowsParams {
  rows: number;
  x0: number;
  step: number;
  depth: number;
  margin: number;
  aisle: number;
}

/** Две колонки парт с центральным проходом */
export function genRows(s: PlanState, p: RowsParams): void {
  const colW = (s.room.W - 2 * p.margin - p.aisle) / 2;
  for (let i = 0; i < p.rows; i++) {
    const x = p.x0 + i * p.step;
    s.items.push({ id: uid(), type: 'desk', label: '', x, y: p.margin, w: p.depth, d: colW });
    s.items.push({ id: uid(), type: 'desk', label: '', x, y: p.margin + colW + p.aisle, w: p.depth, d: colW });
  }
}

/** Проверка, что открываемый JSON похож на проект; недостающие поля — из пустого плана */
export function fromJson(raw: unknown): PlanState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<PlanState>;
  if (!s.room || !s.wallItems) return null;
  return { ...blank(), ...s } as PlanState;
}
