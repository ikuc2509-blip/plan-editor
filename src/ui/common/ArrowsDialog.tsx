// Стрелки с номерами меток на снимке — для фототаблицы. Оригинал снимка не меняется:
// стрелки хранятся отдельно (photo.arrows) и рисуются поверх только в PDF и здесь.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PhotoArrow } from '../../model/types';
import * as A from '../../model/actions';
import { uid } from '../../model/state';
import { arrowGeom, arrowsTail, newArrow } from '../../photos/phototable';
import { dispatch, plan } from '../store';
import { originalUrl } from '../photos';
import { Select } from './fields';

/** снимок, на котором ставят стрелки */
export const arrowsPhoto = signal<string | null>(null);

type Grab = { id: string; end: 'tip' | 'tail'; key: string };
let grabN = 0;

export function ArrowsDialog() {
  const id = arrowsPhoto.value;
  const ph = id ? plan.value.photos.find(p => p.id === id) : undefined;
  const dlg = useRef<HTMLDialogElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [mk, setMk] = useState('');
  const grab = useRef<Grab | null>(null);
  const markers = plan.value.markers;

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    let u: string | null = null;
    if (id) {
      setSize(null);
      setMk(prev => (markers.some(m => m.id === prev) ? prev : markers[0]?.id ?? ''));
      void originalUrl(id).then(x => { u = x; setUrl(x); });
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
    return () => { if (u) URL.revokeObjectURL(u); setUrl(null); };
  }, [id]);

  const close = () => { arrowsPhoto.value = null; };
  const set = (arrows: PhotoArrow[], key?: string) => { if (ph) dispatch(p => A.patch(p, 'photos', ph.id, { arrows }), key); };
  /** точка нажатия — в долях снимка */
  const at = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const k = (v: number) => Math.min(1, Math.max(0, v));
    return { x: k((e.clientX - r.left) / r.width), y: k((e.clientY - r.top) / r.height) };
  };

  const onDown = (e: PointerEvent) => {
    if (!ph || e.button !== 0) return;
    svg.current!.setPointerCapture(e.pointerId);
    const el = (e.target as Element).closest<SVGElement>('[data-ar]');
    const key = `arrow:${++grabN}`;
    if (el) { grab.current = { id: el.dataset.ar!, end: el.dataset.end === 'tail' ? 'tail' : 'tip', key }; return; }
    if (!mk) return;
    // у метки одна стрелка на снимке: новая точка переносит её
    const p = at(e), old = ph.arrows.find(a => a.markerId === mk);
    const a = old ? { ...old, x: p.x, y: p.y, tx: old.tx + p.x - old.x, ty: old.ty + p.y - old.y } : newArrow(uid(), mk, p.x, p.y);
    set([...ph.arrows.filter(x => x.markerId !== mk), a], key);
    grab.current = { id: a.id, end: 'tip', key };
  };
  const onMove = (e: PointerEvent) => {
    const g = grab.current;
    if (!g || !ph) return;
    const p = at(e);
    set(ph.arrows.map(a => (a.id !== g.id ? a : g.end === 'tip' ? { ...a, x: p.x, y: p.y } : { ...a, tx: p.x, ty: p.y })), g.key);
  };
  const onUp = () => { grab.current = null; };

  const W = size?.w ?? 1000, H = size?.h ?? 750;
  const label = (markerId: string) => markers.find(m => m.id === markerId);
  return (
    <dialog ref={dlg} class="arrows" onCancel={e => { e.preventDefault(); close(); }}>
      {ph && (
        <>
          <div class="ar-head">
            <b>Стрелки на снимке № {ph.n}</b>
            <span class="grow" />
            <button class="primary" onClick={close}>Готово</button>
          </div>
          {markers.length ? (
            <div class="ar-tools">
              <Select label="Стрелка на метку" value={mk} options={Object.fromEntries(markers.map(m => [m.id, `№ ${m.n}${m.desc ? ' — ' + m.desc.slice(0, 40) : ''}`]))} onValue={setMk} />
              <span class="hint">Нажмите на снимок — туда встанет остриё стрелки. Остриё и кружок с номером можно тащить.</span>
            </div>
          ) : <p class="warn">Меток пока нет. Стрелка показывает на метку: поставьте метку на плане (вкладка «Метки»), её номер будет и на стрелке.</p>}
          <div class="ar-box">
            {url && <img src={url} alt={`Снимок № ${ph.n}`} onLoad={e => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />}
            {size && (
              <svg ref={svg} viewBox={`0 0 ${W} ${H}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="arrows-photo">
                {ph.arrows.map(a => {
                  const m = label(a.markerId);
                  if (!m) return null;
                  const g = arrowGeom(a, W, H), sw = g.r * 0.28;
                  return (
                    <g key={a.id}>
                      <line x1={g.from.x} y1={g.from.y} x2={g.base.x} y2={g.base.y} stroke="#D0332B" stroke-width={sw} />
                      <polygon data-ar={a.id} data-end="tip" points={g.head.map(q => `${q.x},${q.y}`).join(' ')} fill="#D0332B" style="cursor:move" />
                      <g data-ar={a.id} data-end="tail" style="cursor:move">
                        <circle cx={g.tail.x} cy={g.tail.y} r={g.r} fill="#fff" stroke="#D0332B" stroke-width={g.r * 0.18} />
                        <text x={g.tail.x} y={g.tail.y + g.r * 0.4} font-size={g.r * 1.15} font-weight="700" text-anchor="middle" fill="#D0332B">{m.n}</text>
                      </g>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
          {ph.arrows.length > 0 && (
            <div class="ar-list">
              {ph.arrows.map(a => (
                <span key={a.id} class="chip">
                  Стрелка № {label(a.markerId)?.n ?? '?'}
                  <button class="inline" aria-label={`Убрать стрелку № ${label(a.markerId)?.n ?? ''}`} onClick={() => set(ph.arrows.filter(x => x.id !== a.id))}>Убрать</button>
                </span>
              ))}
              <p class="hint">В подписи будет: {arrowsTail(plan.value, ph) || '—'}</p>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
