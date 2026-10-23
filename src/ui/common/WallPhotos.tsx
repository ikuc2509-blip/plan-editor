// Снимки на развёртке стен (этап 9): список кадров — показать, прозрачность, углы, масштаб.
import * as A from '../../model/actions';
import { findWall, wallsByLetter } from '../../model/room';
import { formatMeters } from '../../model/units';
import { frameSpan } from '../../model/wallPhotos';
import { dispatch, endGesture, plan } from '../store';
import { Check, Field, parseNum } from './fields';
import { Thumb } from '../editor/PhotosPanel';
import { openRectify } from '../rectify';
import { startTrace, tracing } from '../trace';
import { WI_TYPES } from '../../model/labels';
import type { WallItemType } from '../../model/types';
import { useEffect } from 'preact/hooks';

export function WallPhotosList({ wallId }: { wallId?: string }) {
  const p = plan.value;
  const order = wallsByLetter(p.room).map(w => w.id);
  const list = p.wallPhotos
    .filter(wp => !wallId || wp.wallId === wallId)
    .sort((a, b) => order.indexOf(a.wallId) - order.indexOf(b.wallId) || (frameSpan(p, a)?.from ?? 0) - (frameSpan(p, b)?.from ?? 0));
  if (!list.length) {
    return <p class="hint">Снимков на развёртке нет. Снимок стены можно выпрямить: «Выпрямить на стену» в карточке снимка (Фото).</p>;
  }
  return (
    <>
      {list.map(wp => {
        const ph = p.photos.find(x => x.id === wp.photoId), s = frameSpan(p, wp);
        const set = (o: Partial<typeof wp>, key?: string) => dispatch(q => A.patch(q, 'wallPhotos', wp.id, o), key);
        return (
          <div key={wp.id} class="card" data-card={wp.id}>
            <div class="card-h">
              {ph && <Thumb ph={ph} small />}
              <b class="f" style="font-size:13px;color:var(--ink)">Стена {findWall(p.room, wp.wallId)?.letter}: снимок № {ph?.n ?? '?'}</b>
              <span class="hint" style="margin:0">{s ? `${formatMeters(s.from)}–${formatMeters(s.to)} м` : 'края перепутаны'}</span>
            </div>
            <Check label="Показывать на развёртке" checked={wp.show} onValue={v => set({ show: v })} />
            {wp.show && (
              <Field label="Прозрачность" wide>
                <input type="range" min="0.2" max="1" step="0.05" value={wp.opacity} onPointerUp={endGesture}
                  onInput={e => set({ opacity: parseNum(e.currentTarget.value) }, `wp:${wp.id}:opacity`)} />
              </Field>
            )}
            <div class="row" style="margin:6px 0 0">
              <button onClick={() => openRectify(wp.photoId, { wpId: wp.id })}>Углы и края</button>
              <button onClick={() => openRectify(wp.photoId, { wpId: wp.id, scale: true })}>Масштаб по фото</button>
            </div>
          </div>
        );
      })}
      <p class="hint">Снимок на развёртке виден только на экране — для обводки; в PDF он не попадает.</p>
    </>
  );
}

const TRACE_TYPES: WallItemType[] = ['window', 'door', 'radiator', 'other'];

/** «Обвести по снимку»: тип элемента, затем два угла на развёртке */
export function TraceBar() {
  const t = tracing.value;
  // ушли со вкладки или шага — обводка отменяется
  useEffect(() => () => { tracing.value = null; }, []);
  if (t) {
    return (
      <p class="warn">
        Обводка: {WI_TYPES[t.type].toLowerCase()}. {t.first ? 'Теперь — противоположный угол.' : 'Коснитесь на развёртке стены одного угла, затем противоположного.'}{' '}
        <button class="inline" onClick={() => { tracing.value = null; }}>Отмена</button>
      </p>
    );
  }
  return (
    <div class="row" style="align-items:center">
      <span class="hint" style="margin:0">Обвести по снимку:</span>
      {TRACE_TYPES.map(k => <button key={k} onClick={() => startTrace(k)}>{WI_TYPES[k]}</button>)}
    </div>
  );
}
