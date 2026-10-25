// Окно «Выпрямить» (этап 9): стена, четыре угла на снимке с лупой, края кадра;
// затем — масштаб по отрезку известной длины на выпрямленной картинке.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { FrameEdge, PhotoPt, WallPhoto } from '../../model/types';
import * as A from '../../model/actions';
import { wallsByLetter, findWall, wallLength } from '../../model/room';
import { uid } from '../../model/state';
import { cond, formatMeters, parseLength } from '../../model/units';
import { applyScaleFix, frameAspect, frameSpan, photoScale } from '../../model/wallPhotos';
import { quadOk, tidyQuad } from '../../geometry/homography';
import type { WorkImage } from '../../photos/rectify';
import { dispatch, plan, toast } from '../store';
import { Len } from './fields';
import { photoWork, rectifying, wallImages } from '../rectify';

const CORNERS = ['вверху слева (у потолка)', 'вверху справа (у потолка)', 'внизу справа (у пола)', 'внизу слева (у пола)'];

const clamp = (t: number) => Math.max(0, Math.min(1, t));

interface PadProps {
  url: string;
  /** ширина / высота картинки */
  ratio: number;
  pts: PhotoPt[];
  max: number;
  /** соединять точки в четырёхугольник */
  closed: boolean;
  onPts: (p: PhotoPt[]) => void;
}

/** Картинка, на которой отмечают точки пальцем или мышью; лупа под пальцем */
function PointPad({ url, ratio, pts, max, closed, onPts }: PadProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loupe, setLoupe] = useState<PhotoPt | null>(null);
  const drag = useRef<number | null>(null);
  const cur = useRef(pts);
  cur.current = pts;

  // картинка вписывается в свободное место целиком
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const w = Math.min(el.clientWidth, el.clientHeight * ratio);
      setSize({ w, h: w / ratio });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);

  const at = (e: PointerEvent): PhotoPt => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const onDown = (e: PointerEvent) => {
    const f = at(e);
    // рядом с точкой (палец — 28 px) — двигаем её, иначе ставим новую
    let best = -1, bd = 28;
    cur.current.forEach((q, i) => { const d = Math.hypot((q.x - f.x) * size.w, (q.y - f.y) * size.h); if (d < bd) { bd = d; best = i; } });
    if (best < 0 && cur.current.length >= max) return;
    box.current!.setPointerCapture(e.pointerId);
    if (best < 0) { onPts([...cur.current, f]); best = cur.current.length; }
    drag.current = best;
    setLoupe(f);
  };
  const onMove = (e: PointerEvent) => {
    if (drag.current === null) return;
    const f = at(e), i = drag.current;
    onPts(cur.current.map((q, j) => (j === i ? f : q)));
    setLoupe(f);
  };
  const onUp = () => { drag.current = null; setLoupe(null); };

  const px = (q: PhotoPt) => `${q.x * size.w},${q.y * size.h}`;
  const Z = 3, R = 60;
  return (
    <div class="rp-wrap" ref={wrap}>
      <div class="rp-box" ref={box} style={{ width: size.w + 'px', height: size.h + 'px' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="pointpad">
        <img src={url} alt="" draggable={false} />
        <svg width={size.w} height={size.h}>
          {pts.length > 1 && (closed && pts.length === 4
            ? <polygon points={pts.map(px).join(' ')} class="rp-quad" />
            : <polyline points={pts.map(px).join(' ')} class="rp-quad" />)}
          {pts.map((q, i) => (
            <g key={i}>
              <circle cx={q.x * size.w} cy={q.y * size.h} r="13" class="rp-h" />
              <text x={q.x * size.w} y={q.y * size.h + 4.5} class="rp-n">{i + 1}</text>
            </g>
          ))}
        </svg>
        {loupe && (
          <div class="loupe" style={{
            left: loupe.x * size.w - R + 'px',
            top: (loupe.y * size.h > 2.4 * R ? loupe.y * size.h - 2.4 * R : loupe.y * size.h + 0.6 * R) + 'px',
            backgroundImage: `url("${url}")`,
            backgroundSize: `${size.w * Z}px ${size.h * Z}px`,
            backgroundPosition: `${R - loupe.x * size.w * Z}px ${R - loupe.y * size.h * Z}px`,
          }} />
        )}
      </div>
    </div>
  );
}

/** Край кадра: угол стены или ориентир на расстоянии от левого угла */
function EdgeField({ label, edge, wallLen, onEdge }: { label: string; edge: FrameEdge; wallLen: number; onEdge: (e: FrameEdge) => void }) {
  return (
    <div class="rx-edge">
      <span class="rx-l">{label}</span>
      <div class="os-pick" role="group" aria-label={label}>
        <button aria-pressed={edge.kind === 'corner'} onClick={() => onEdge({ kind: 'corner' })}>Угол стены</button>
        <button aria-pressed={edge.kind === 'mark'} onClick={() => { if (edge.kind !== 'mark') onEdge({ kind: 'mark', off: cond(Math.round(wallLen / 2)) }); }}>Ориентир</button>
      </div>
      {edge.kind === 'mark' && (
        <Len label="От левого угла стены, м" value={edge.off.mm} onValue={mm => onEdge({ kind: 'mark', off: { ...edge.off, mm } })} />
      )}
    </div>
  );
}

type Work = WorkImage | 'loading' | 'fail';

export function RectifyDialog() {
  const req = rectifying.value;
  const dlg = useRef<HTMLDialogElement>(null);
  const p = plan.value;
  const ph = req && p.photos.find(x => x.id === req.photoId);
  const existing = req?.wpId ? p.wallPhotos.find(w => w.id === req.wpId) : undefined;
  const [work, setWork] = useState<Work>('loading');
  const [pts, setPts] = useState<PhotoPt[]>([]);
  const [wallId, setWallId] = useState('A');
  const [left, setLeft] = useState<FrameEdge>({ kind: 'corner' });
  const [right, setRight] = useState<FrameEdge>({ kind: 'corner' });
  // масштаб: два конца отрезка и его настоящая длина
  const [seg, setSeg] = useState<PhotoPt[]>([]);
  const [known, setKnown] = useState('');

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (req && !d.open) d.showModal();
    if (!req && d.open) d.close();
    if (!req) return;
    const ex = req.wpId ? plan.value.wallPhotos.find(w => w.id === req.wpId) : undefined;
    const photo = plan.value.photos.find(x => x.id === req.photoId);
    // кадры, выпрямленные до 0.11.1, могли лечь повёрнутыми — «Готово» сохранит углы по порядку
    setPts(tidyQuad(ex?.quad ?? []));
    setWallId(ex?.wallId ?? req.wallId ?? (photo?.link.kind === 'wall' ? photo.link.wallId : 'A'));
    setLeft(ex?.left ?? { kind: 'corner' });
    setRight(ex?.right ?? { kind: 'corner' });
    setSeg([]); setKnown('');
    setWork('loading');
    let on = true;
    void photoWork(req.photoId).then(w => { if (on) setWork(w ?? 'fail'); });
    return () => { on = false; };
  }, [req?.photoId, req?.wpId, req?.scale]);

  const close = () => { rectifying.value = null; };
  if (!req) return <dialog ref={dlg} class="rect" />;

  const wall = findWall(p.room, wallId);
  const wallLen = wall ? wallLength(wall) : 0;
  const draft: WallPhoto = { id: existing?.id ?? '', photoId: req.photoId, wallId, quad: pts, left, right, show: true, opacity: existing?.opacity ?? 0.85 };
  const spanOk = !!frameSpan(p, draft);
  const ready = pts.length === 4 && quadOk(pts) && spanOk;

  const onPts = (q: PhotoPt[]) => setPts(tidyQuad(q));

  const save = (toScale: boolean) => {
    if (!ready) return;
    const id = existing?.id ?? uid();
    const wp = { ...draft, id };
    dispatch(q => {
      let r = existing ? A.patch(q, 'wallPhotos', id, { wallId, quad: pts, left, right }) : A.addWallPhoto(q, wp);
      // снимок без привязки — теперь он снимок этой стены
      if (ph && ph.link.kind === 'none') r = A.patch(r, 'photos', ph.id, { link: { kind: 'wall', wallId } });
      return r;
    });
    toast(`Снимок № ${ph?.n ?? ''} — на стене ${wall?.letter ?? ''}`);
    if (toScale) rectifying.value = { photoId: req.photoId, wpId: id, scale: true };
    else close();
  };

  const title = `Снимок № ${ph?.n ?? '?'}`;
  const ratio = work !== 'loading' && work !== 'fail' ? work.raster.width / work.raster.height : 4 / 3;

  /* ——— масштаб по фото ——— */
  if (req.scale && existing) {
    const url = wallImages.value[existing.id];
    const aspect = frameAspect(p, existing) ?? 1;
    const k = parseLength(known);
    const res = seg.length === 2 && k.ok ? photoScale(p, existing, seg[0]!, seg[1]!, k.mm) : null;
    const wl = { mm: wall ? wallLength(wall) : 0 };
    const fixText = !res ? '' : res.fix.what === 'height'
      ? `высота помещения ≈ ${formatMeters(res.fix.mm)} м (по фото), сейчас ${formatMeters(p.room.height.mm)} м`
      : res.fix.what === 'wall'
        ? `длина стены ${wall?.letter} ≈ ${formatMeters(res.fix.mm)} м (по фото), сейчас ${formatMeters(wl.mm)} м`
        : `ориентир ${res.fix.what === 'left' ? 'левого' : 'правого'} края ≈ ${formatMeters(res.fix.mm)} м от угла (по фото)`;
    return (
      <dialog ref={dlg} class="rect" onCancel={e => { e.preventDefault(); close(); }}>
        <div class="rx">
          <div class="rx-top">
            <b>{title} — масштаб по фото</b>
            <button class="ghost" onClick={close} aria-label="Закрыть">✕</button>
          </div>
          <p class="rx-hint">{seg.length < 2 ? `Отметьте концы того, что знаете по длине: замеренная ширина двери, лист А4 (0,297 м), рулетка в кадре. Отмечено: ${seg.length} из 2.` : 'Концы можно перетащить. Впишите настоящую длину ниже.'}</p>
          {url ? <PointPad url={url} ratio={aspect} pts={seg} max={2} closed={false} onPts={setSeg} /> : <div class="rp-wrap"><p class="rx-hint">Готовлю выпрямленную картинку…</p></div>}
          <div class="rx-bottom">
            <label class="f"><span>Настоящая длина отрезка, м</span>
              <input inputMode="decimal" value={known} placeholder="0,9" onInput={e => setKnown(e.currentTarget.value)} />
            </label>
            {known && !k.ok && <p class="err-line">{k.error}</p>}
            {res && (
              <p class={res.locked ? 'hint' : 'warn'}>
                Отрезок {res.dir === 'h' ? 'вдоль стены' : 'по высоте'}. По снимку выходит: {fixText}.
                {res.locked && ' Этот размер уже замерен — оставляю как есть.'}
              </p>
            )}
            <div class="row">
              <button class="ghost" onClick={() => setSeg([])}>Заново</button>
              <button class="ghost" onClick={() => { rectifying.value = { photoId: req.photoId, wpId: existing.id }; }}>← Углы</button>
              <button class="primary" disabled={!res || res.locked} onClick={() => {
                if (!res) return;
                dispatch(q => applyScaleFix(q, existing.id, res.fix));
                toast('Применено: ' + fixText.replace(/, сейчас.*$/, '') + '. Статус — «условно».');
                close();
              }}>Применить</button>
            </div>
          </div>
        </div>
      </dialog>
    );
  }

  /* ——— углы ——— */
  const hint = work === 'fail'
    ? 'Браузер не может открыть этот снимок (например, формат HEIC). Снимите стену встроенной камерой или добавьте снимок в JPEG.'
    : pts.length < 4
      ? `Коснитесь угла стены ${pts.length + 1} из 4: ${CORNERS[pts.length]}. Держите палец — под ним лупа, ведите к точному месту.`
      : !quadOk(pts) ? 'Углы перекрещиваются — нажмите «Заново».' : 'Углы можно поправить, перетащив их. Края кадра и стена — ниже.';
  return (
    <dialog ref={dlg} class="rect" onCancel={e => { e.preventDefault(); close(); }}>
      <div class="rx">
        <div class="rx-top">
          <b>{title} — выпрямить на стену</b>
          <button class="ghost" onClick={close} aria-label="Закрыть">✕</button>
        </div>
        <p class="rx-hint">{hint}</p>
        {work === 'loading' && <div class="rp-wrap"><p class="rx-hint">Открываю снимок…</p></div>}
        {work !== 'loading' && work !== 'fail' && <PointPad url={work.url} ratio={ratio} pts={pts} max={4} closed onPts={onPts} />}
        {work === 'fail' && <div class="rp-wrap" />}
        <div class="rx-bottom">
          <div class="os-pick" role="group" aria-label="Стена">
            {wallsByLetter(p.room).map(w => <button key={w.id} aria-pressed={w.id === wallId} onClick={() => setWallId(w.id)}>Стена {w.letter}</button>)}
          </div>
          <div class="rx-edges">
            <EdgeField label="Левый край кадра" edge={left} wallLen={wallLen} onEdge={setLeft} />
            <EdgeField label="Правый край кадра" edge={right} wallLen={wallLen} onEdge={setRight} />
          </div>
          {!spanOk && <p class="warn">Левый край кадра должен быть левее правого (отступы — от левого угла, если стоять лицом к стене).</p>}
          <p class="hint">Вся стена в кадре — оба края «угол». Длинная стена по частям — у края, где кадр кончается, «ориентир»: то, что видно и на соседнем кадре (край окна, дверной косяк), и его расстояние от левого угла.</p>
          <div class="row">
            <button class="ghost" onClick={() => setPts([])}>Заново</button>
            {existing && <button class="del" onClick={() => { dispatch(q => A.remove(q, 'wallPhotos', existing.id)); close(); }}>Убрать со стены</button>}
            <button disabled={!ready} onClick={() => save(true)}>Масштаб по фото</button>
            <button class="primary" disabled={!ready} onClick={() => save(false)}>Готово</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
