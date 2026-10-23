// Обводка по снимку (этап 9): «Обвести», два касания по противоположным углам на развёртке стены —
// готовый элемент стены «условно», происхождение — снимок под этим местом и рамка на нём.
import { signal } from '@preact/signals';
import type { Origin, WallItemType } from '../model/types';
import * as A from '../model/actions';
import { WI_TYPES } from '../model/labels';
import { uid } from '../model/state';
import { frameAt, photoBoxOf } from '../model/wallPhotos';
import type { Spot } from '../geometry/unfold';
import { snapMm } from '../geometry/rotate';
import { dispatch, plan, sel, toast } from './store';

type WallSpot = Extract<Spot, { place: 'wall' }>;

/** идёт обводка: что обводим и первый угол, если уже отмечен */
export const tracing = signal<{ type: WallItemType; first?: WallSpot } | null>(null);

export function startTrace(type: WallItemType): void {
  tracing.value = { type };
}

/** палец не точнее сантиметра */
const cm = (mm: number) => snapMm(mm, 10);

export function traceTap(s: Spot): void {
  const t = tracing.value;
  if (!t) return;
  if (s.place !== 'wall') { toast('Обводят по развёртке стены: коснитесь угла окна или двери на снимке'); return; }
  if (!t.first) { tracing.value = { ...t, first: s }; toast('Теперь — противоположный угол'); return; }
  if (t.first.wallId !== s.wallId) { toast('Второй угол — на той же стене'); return; }
  const off = cm(Math.min(t.first.off, s.off)), z = cm(Math.min(t.first.z, s.z));
  const w = cm(Math.abs(t.first.off - s.off)), h = cm(Math.abs(t.first.z - s.z));
  if (w < 50 || h < 50) { toast('Рамка меньше 5 см — отметьте углы ещё раз'); tracing.value = { type: t.type }; return; }
  const p = plan.value, r = { off, z, w, h };
  const wp = frameAt(p, s.wallId, off + w / 2);
  const box = wp && photoBoxOf(p, wp, r);
  const origin: Origin = wp && box ? { kind: 'photo', photoId: wp.photoId, box } : { kind: 'manual' };
  const id = uid();
  dispatch(q => A.addTracedWallItem(q, id, t.type, s.wallId, r, origin));
  sel.value = { kind: 'wi', id };
  tracing.value = null;
  toast(`${WI_TYPES[t.type]}: обведено${origin.kind === 'photo' ? ' по снимку' : ''}, размеры — «условно»`);
}
