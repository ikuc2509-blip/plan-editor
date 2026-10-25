// Распознавание в «Чистовике» (этап 10): пакет на вкладке «Файл», кнопка у снимка стены,
// предложения модели (фиолетовые рамки) и окно сравнения «снимок — развёртка».
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Plan, WallItemType } from '../../model/types';
import { WI_TYPES } from '../../model/labels';
import { findWall } from '../../model/room';
import { formatMeters } from '../../model/units';
import { frameSpan } from '../../model/wallPhotos';
import { drawSheet, sheetGeom } from '../../render/sheet';
import { R, T } from '../../render/svg';
import { segOf, textRot, unf, unfRect } from '../../geometry/unfold';
import { formatSize } from '../../photos/meta';
import { PACK, packSize } from '../../recognize/packInfo';
import { endGesture, plan } from '../store';
import { wallImages } from '../rectify';
import {
  accept, acceptAll, cancelDownload, comparing, device, dismiss, dismissAll, exportToFile, gpu, importFromDisk, lastMs,
  packBusy, packBytes, packReady, recognizeFrame, recognizing, refreshPack, removePack, startDownload, suggSel,
  suggestions, threshold, type Suggestion,
} from '../recognize';
import { parseNum } from './fields';

/** цвет предложений модели — ни с чем на листе не путается */
export const SUGG = '#7B3FBF';
const pct = (s: number) => `${Math.round(s * 100)} %`;
const label = (s: Suggestion) => `${WI_TYPES[s.type].toLowerCase()}? ${pct(s.score)}`;
const DEVICE = { webgpu: 'видеокарта', wasm: 'процессор' } as const;

/** Рамки предложений поверх листа — только на экране, в файлы не попадают */
export function suggestSvg(p: Plan, list: readonly Suggestion[], selId: string | null): string {
  const g = sheetGeom(p);
  return list.map(s => {
    const sg = segOf(g, s.wallId);
    if (!sg) return '';
    const m = (mm: number) => mm / 1000;
    const r = unfRect(g, sg, m(s.r.off), m(s.r.z), m(s.r.w), m(s.r.h));
    const on = s.id === selId;
    const [lx, ly] = unf(g, sg, m(s.r.off + s.r.w / 2), m(s.r.z + s.r.h) - 2.6 / g.s);
    return `<g data-sugg="${s.id}" style="cursor:pointer">` +
      R(r.x, r.y, r.w, r.h, `fill="${SUGG}" fill-opacity="${on ? 0.3 : 0.12}" stroke="${SUGG}" stroke-width="${on ? 0.8 : 0.45}" stroke-dasharray="1.6 0.8"`) +
      T(lx, ly, label(s), { size: 2.1, anchor: 'middle', weight: 700, fill: SUGG, rot: textRot(sg) }) + '</g>';
  }).join('');
}

/* ——— вкладка «Файл» ——— */

export function PackPanel() {
  useEffect(() => { void refreshPack(); }, []);
  const have = packBytes.value, total = packSize(), busy = packBusy.value;
  return (
    <>
      <h3>Распознавание по фото</h3>
      <p class="hint">
        Модель находит на выпрямленных снимках стен окна, двери, радиаторы, доски и экраны и предлагает их рамками.
        Работает на компьютере, в этом браузере, без интернета: снимки никуда не отправляются. Для этого один раз
        скачивается пакет распознавания — {formatSize(total)}. Модель: {PACK.title}.
      </p>
      {busy?.what === 'download' && (
        <>
          <progress max={total} value={busy.done} style="width:100%" />
          <p class="hint">Скачано {formatSize(busy.done)} из {formatSize(total)}. Каждый кусок сверяется с отпечатком SHA-256.</p>
          <div class="row"><button onClick={cancelDownload}>Остановить</button></div>
        </>
      )}
      {busy?.what === 'import' && <p class="hint">Проверяю файлы с диска…</p>}
      {busy?.what === 'export' && <p class="hint">Готовлю файл пакета…</p>}
      {!busy && (
        <>
          {packReady.value
            ? <p class="hint">Пакет скачан и проверен ({formatSize(total)}). Он хранится в браузере и после обновления приложения не качается заново.</p>
            : have !== null && have > 0 && <p class="hint">Скачано {formatSize(have)} из {formatSize(total)} — можно докачать.</p>}
          <div class="row">
            {!packReady.value && <button class="primary" onClick={() => void startDownload()}>Скачать пакет ({formatSize(total - (have ?? 0))})</button>}
            {!packReady.value && <button onClick={() => void importFromDisk()}>Загрузить с диска</button>}
            {packReady.value && <button onClick={() => void exportToFile()}>Сохранить пакет в файл</button>}
            {(packReady.value || (have ?? 0) > 0) && <button class="ghost" onClick={() => void removePack()}>Удалить пакет</button>}
          </div>
          {!packReady.value && <p class="hint">«Загрузить с диска» — для компьютера без интернета: файл, сохранённый кнопкой «Сохранить пакет в файл» на другом компьютере (флешка).</p>}
        </>
      )}
      {gpu.value === false && <p class="hint">Видеокарта в этом браузере недоступна (нет WebGPU) — модель будет считать на процессоре, около минуты на снимок. Быстрее — в свежем Chrome или Edge.</p>}
      {device.value && <p class="hint">Модель загружена, считает: {DEVICE[device.value]}{lastMs.value !== null ? `; последний снимок — ${(lastMs.value / 1000).toFixed(1).replace('.', ',')} с` : ''}.</p>}
    </>
  );
}

/* ——— у снимка на развёртке ——— */

export function RecognizeButtons({ wpId }: { wpId: string }) {
  const busy = recognizing.value;
  const mine = suggestions.value.filter(s => s.wpId === wpId).length;
  return (
    <div class="row" style="margin:6px 0 0">
      <button disabled={!!busy || !wallImages.value[wpId]} onClick={() => void recognizeFrame(wpId)}>
        {busy === wpId ? 'Распознаю…' : 'Найти окна, двери…'}
      </button>
      {mine > 0 && <button onClick={() => { comparing.value = wpId; }}>Сравнить ({mine})</button>}
    </div>
  );
}

/* ——— список предложений ——— */

const TYPES: WallItemType[] = ['window', 'door', 'radiator', 'board', 'screen', 'other'];
const typeOpts = Object.fromEntries(TYPES.map(t => [t, WI_TYPES[t]])) as Record<WallItemType, string>;

function SuggCard({ s }: { s: Suggestion }) {
  const wall = findWall(plan.value.room, s.wallId);
  const on = suggSel.value === s.id;
  const [type, setType] = useState<WallItemType>(s.type);
  return (
    <div class={'card sugg' + (on ? ' sel' : '')} data-sugg-card={s.id} onClick={() => { suggSel.value = s.id; }}>
      <div class="card-h">
        <select aria-label="Что это" value={type} onChange={e => setType(e.currentTarget.value as WallItemType)} onClick={e => e.stopPropagation()}>
          {TYPES.map(t => <option key={t} value={t}>{typeOpts[t]}</option>)}
        </select>
        <span class="hint" style="margin:0">стена {wall?.letter}, уверенность {pct(s.score)}</span>
      </div>
      <p class="hint" style="margin:4px 0">
        Отступ ≈ {formatMeters(s.r.off)} м, от пола ≈ {formatMeters(s.r.z)} м, {formatMeters(s.r.w)} × {formatMeters(s.r.h)} м (по фото)
      </p>
      <div class="row" style="margin:0">
        <button class="primary" onClick={e => { e.stopPropagation(); accept(s.id, type); }}>Принять</button>
        <button onClick={e => { e.stopPropagation(); dismiss(s.id); }}>Удалить</button>
      </div>
    </div>
  );
}

function Threshold() {
  return (
    <label class="f wide">
      <span>Порог уверенности: {pct(threshold.value)} — ниже рамки не показываются</span>
      <input type="range" min="0.05" max="0.6" step="0.01" value={threshold.value} onPointerUp={endGesture}
        onInput={e => { threshold.value = parseNum(e.currentTarget.value); }} />
    </label>
  );
}

/** Предложения модели на вкладке «Стены» */
export function SuggestPanel() {
  const list = suggestions.value, busy = recognizing.value;
  // выбранное на листе — прокрутить к его карточке
  useEffect(() => {
    if (suggSel.value) document.querySelector(`[data-sugg-card="${suggSel.value}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [suggSel.value]);
  if (!list.length && !busy) return null;
  return (
    <div class="suggs">
      <h3 style="margin-top:0">Предложения модели{list.length ? `: ${list.length}` : ''}</h3>
      {busy && <p class="hint">Распознаю снимок{device.value ? ` (${DEVICE[device.value]})` : ''}… Окно можно не трогать — расчёт идёт в фоне.</p>}
      <p class="hint">Фиолетовые рамки на развёртке — только предложения: на лист и в PDF они не попадают, пока вы их не примете. Принятое получает статус «условно».</p>
      <Threshold />
      {list.length > 0 && (
        <div class="row">
          <button class="primary" onClick={() => acceptAll()}>Принять всё ({list.length})</button>
          <button onClick={() => dismissAll()}>Удалить всё</button>
        </div>
      )}
      {list.map(s => <SuggCard key={s.id} s={s} />)}
    </div>
  );
}

/* ——— окно сравнения ——— */

/** Перевод «участок стены, м (x — от левого угла, y — от потолка вниз)» → лист: матрица для SVG и обратная к ней */
function wallToSheet(p: Plan, wallId: string): { inv: string } | null {
  const g = sheetGeom(p), sg = segOf(g, wallId);
  if (!sg) return null;
  const o = unf(g, sg, 0, g.h), u = unf(g, sg, sg.len, g.h), v = unf(g, sg, 0, 0);
  const a = (u[0] - o[0]) / sg.len, b = (u[1] - o[1]) / sg.len, c = (v[0] - o[0]) / g.h, d = (v[1] - o[1]) / g.h;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return null;
  const e = o[0], f = o[1];
  return { inv: [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det].map(n => +n.toFixed(6)).join(' ') };
}

/** рамки предложений в метрах стены */
function wallRects(list: readonly Suggestion[], H: number, selId: string | null): string {
  return list.map(s => {
    const x = s.r.off / 1000, y = (H - s.r.z - s.r.h) / 1000, on = s.id === selId;
    return `<rect data-sugg="${s.id}" x="${x}" y="${y}" width="${s.r.w / 1000}" height="${s.r.h / 1000}" fill="${SUGG}" fill-opacity="${on ? 0.3 : 0.12}" stroke="${SUGG}" stroke-width="${on ? 3 : 2}" stroke-dasharray="6 3" vector-effect="non-scaling-stroke" style="cursor:pointer"/>`;
  }).join('');
}

export function CompareDialog() {
  const wpId = comparing.value;
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (wpId && !d.open) d.showModal();
    if (!wpId && d.open) d.close();
  }, [wpId]);
  const close = () => { comparing.value = null; };
  const p = plan.value;
  const wp = wpId ? p.wallPhotos.find(w => w.id === wpId) : undefined;
  const span = wp && frameSpan(p, wp), tr = wp && wallToSheet(p, wp.wallId), url = wpId && wallImages.value[wpId];
  if (!wp || !span || !tr || !url) return <dialog ref={dlg} class="rect" />;
  const H = p.room.height.mm, list = suggestions.value.filter(s => s.wpId === wp.id), selId = suggSel.value;
  const ph = p.photos.find(x => x.id === wp.photoId), wall = findWall(p.room, wp.wallId);
  // развёртка обрезается по кадру с небольшим полем — соседние части листа не мешают
  const pad = 0.15, x0 = span.from / 1000 - pad, w0 = (span.to - span.from) / 1000 + 2 * pad, vb = `${x0} ${-pad} ${w0} ${H / 1000 + 2 * pad}`;
  const pick = (e: MouseEvent) => {
    const id = (e.target as Element).closest<SVGElement>('[data-sugg]')?.dataset.sugg;
    if (id) suggSel.value = id;
  };
  // элементы, которые уже на этой стене, — тонким контуром поверх снимка
  const items = p.wallItems.filter(it => it.wallId === wp.wallId).map(it =>
    `<rect x="${it.off.mm / 1000}" y="${(H - it.z.mm - it.h.mm) / 1000}" width="${it.w.mm / 1000}" height="${it.h.mm / 1000}" fill="none" stroke="#E2B007" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join('');
  return (
    <dialog ref={dlg} class="rect" onCancel={e => { e.preventDefault(); close(); }}>
      <div class="rx">
        <div class="rx-top">
          <b>Сравнение: снимок № {ph?.n ?? '?'} и развёртка стены {wall?.letter}</b>
          <button class="ghost" onClick={close} aria-label="Закрыть">✕</button>
        </div>
        <p class="rx-hint">Сверху — выпрямленный снимок, снизу — развёртка на листе. Фиолетовое — предложения модели, жёлтое — то, что уже на плане. Щёлкните рамку, чтобы выбрать её в списке.</p>
        <div class="cmp">
          <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" onClick={pick} data-testid="cmp-photo"
            dangerouslySetInnerHTML={{ __html: `<image href="${url}" x="${span.from / 1000}" y="0" width="${(span.to - span.from) / 1000}" height="${H / 1000}" preserveAspectRatio="none"/>${items}${wallRects(list, H, selId)}` }} />
          <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" onClick={pick} data-testid="cmp-sheet" class="cmp-sheet"
            dangerouslySetInnerHTML={{ __html: `<clipPath id="cmp-clip"><rect x="${x0}" y="${-pad}" width="${w0}" height="${H / 1000 + 2 * pad}"/></clipPath><g clip-path="url(#cmp-clip)"><g transform="matrix(${tr.inv})">${drawSheet(p)}${suggestSvg(p, list, selId)}</g></g>` }} />
        </div>
        <div class="rx-bottom">
          <Threshold />
          {list.length > 0
            ? (
              <div class="row">
                <button class="primary" onClick={() => acceptAll(wp.id)}>Принять всё ({list.length})</button>
                <button onClick={() => dismissAll(wp.id)}>Удалить всё</button>
              </div>
            )
            : <p class="hint">Предложений по этому снимку нет.</p>}
          {list.map(s => <SuggCard key={s.id} s={s} />)}
        </div>
      </div>
    </dialog>
  );
}
