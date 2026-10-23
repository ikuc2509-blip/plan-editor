// Вкладка «Фото»: список съёмки, плитка снимков, карточка снимка, просмотр оригинала.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Photo, PhotoBox, PhotoLink, ShotKind } from '../../model/types';
import * as A from '../../model/actions';
import { wallsByLetter } from '../../model/room';
import { BIG_PROJECT, formatSize, showTaken } from '../../photos/meta';
import { SHOT_KINDS, linkText, shotList, shotPhotos, type ShotItem } from '../../photos/shots';
import { dispatch, plan, tab } from '../store';
import { Select, Text } from '../common/fields';
import { openCameraDialog } from '../common/CameraDialog';
import { originalUrl, photosBytes, pickPhotos, previewUrl, selPhoto } from '../photos';
import { openRectify } from '../rectify';
import { findWall } from '../../model/room';

/** Уменьшенная копия снимка; копии нет (HEIC и т. п.) — значок с номером */
export function Thumb({ ph, small, onClick }: { ph: Photo; small?: boolean; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; void previewUrl(ph.id).then(u => { if (on) setUrl(u); }); return () => { on = false; }; }, [ph.id]);
  return (
    <button class={'thumb' + (small ? ' small' : '') + (selPhoto.value === ph.id ? ' sel' : '')} title={`Снимок № ${ph.n}`} onClick={onClick}>
      {url ? <img src={url} alt={`Снимок № ${ph.n}`} /> : <span class="noimg">{ph.file ? 'нет копии' : 'файл не найден'}</span>}
      <span class="n">{ph.n}</span>
    </button>
  );
}

/** Перейти к снимку на вкладке «Фото» (из карточки метки) */
export function showPhoto(id: string): void {
  selPhoto.value = id;
  tab.value = 'photos';
}

const viewing = signal<{ url: string; title: string; box?: PhotoBox } | null>(null);

/** Снимок, по которому обведён объект, — с рамкой (этап 9) */
export async function showPhotoBox(photoId: string, box: PhotoBox): Promise<void> {
  const ph = plan.value.photos.find(x => x.id === photoId), u = await originalUrl(photoId);
  if (u) viewing.value = { url: u, title: `Снимок № ${ph?.n ?? '?'} — рамка: откуда взят объект`, box };
}

/** Оригинал на весь экран */
export function PhotoViewer() {
  const v = viewing.value;
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (v && !d.open) d.showModal();
    if (!v && d.open) d.close();
  }, [v]);
  const close = () => { if (v) URL.revokeObjectURL(v.url); viewing.value = null; };
  return (
    <dialog ref={dlg} class="viewer" onCancel={e => { e.preventDefault(); close(); }} onClick={close}>
      {v && (
        <>
          <span class="vw">
            <img src={v.url} alt={v.title} />
            {v.box && <i class="vbox" style={{ left: v.box.x * 100 + '%', top: v.box.y * 100 + '%', width: v.box.w * 100 + '%', height: v.box.h * 100 + '%' }} />}
          </span>
          <span class="cap">{v.title} — щелчок, чтобы закрыть</span>
        </>
      )}
    </dialog>
  );
}

const LINK_NONE = 'none';
const encLink = (l: PhotoLink) => (l.kind === 'marker' ? 'm:' + l.markerId : l.kind === 'wall' ? 'w:' + l.wallId : LINK_NONE);
const decLink = (v: string): PhotoLink =>
  v.startsWith('m:') ? { kind: 'marker', markerId: v.slice(2) } : v.startsWith('w:') ? { kind: 'wall', wallId: v.slice(2) } : { kind: 'none' };

function PhotoCard({ ph }: { ph: Photo }) {
  const p = plan.value;
  const set = (o: Partial<Photo>, key?: string) => dispatch(q => A.patch(q, 'photos', ph.id, o), key);
  const links: Record<string, string> = { [LINK_NONE]: '— не привязан' };
  for (const m of p.markers) links['m:' + m.id] = `Метка № ${m.n}`;
  for (const w of wallsByLetter(p.room)) links['w:' + w.id] = `Стена ${w.letter}${w.name ? ' — ' + w.name : ''}`;
  const cur = encLink(ph.link);
  if (!(cur in links)) links[cur] = linkText(p, ph.link);
  const kinds = { '': '— не выбран', ...SHOT_KINDS } as Record<ShotKind, string>;
  const open = async () => {
    const u = await originalUrl(ph.id);
    if (u) viewing.value = { url: u, title: `Снимок № ${ph.n}` };
  };
  const del = () => {
    if (!confirm(`Убрать снимок № ${ph.n} из проекта? Отменить можно кнопкой ↶.`)) return;
    dispatch(q => A.removePhoto(q, ph.id));
    selPhoto.value = null;
  };
  return (
    <div class="card sel" data-card={ph.id}>
      <div class="card-h">
        <b class="f" style="font-size:13px;color:var(--ink)">Снимок № {ph.n}</b>
        <button onClick={() => void open()} disabled={!ph.file}>Открыть</button>
        <button class="del" onClick={del}>Удалить</button>
      </div>
      <div class="grid">
        <Text label="№ в фототаблице" value={ph.n} onValue={v => set({ n: v }, `ph:${ph.id}:n`)} />
        <Select<ShotKind> label="Вид съёмки" value={ph.kind} options={kinds} onValue={v => set({ kind: v })} />
        <Select label="К чему относится" value={cur} options={links} onValue={v => set({ link: decLink(v) })} />
      </div>
      <p class="hint" style="margin:8px 0 0">
        {ph.takenAt ? `Снято: ${showTaken(ph.takenAt)}${ph.source === 'camera' ? ' (встроенная камера)' : ''}` : 'Время съёмки в файле не записано'}
        {' · '}{ph.name || ph.file} · {formatSize(ph.size)}
      </p>
      {ph.hasGps && <p class="hint" style="margin:4px 0 0">В снимке записаны координаты места съёмки (GPS). На лист они не выводятся; оригинал не меняется.</p>}
      <p class="hint sha" title={ph.sha256}>SHA-256: {ph.sha256 || '—'}</p>
      <div class="row" style="margin:8px 0 0">
        <button onClick={() => openRectify(ph.id)} disabled={!ph.file}>Выпрямить на стену</button>
        {p.wallPhotos.filter(w => w.photoId === ph.id).map(w => (
          <button key={w.id} class="ghost" onClick={() => openRectify(ph.id, { wpId: w.id })}>На стене {findWall(p.room, w.wallId)?.letter} — изменить</button>
        ))}
      </div>
    </div>
  );
}

function ShotRow({ it }: { it: ShotItem }) {
  const done = shotPhotos(plan.value, it.key);
  const [open, setOpen] = useState(false);
  return (
    <div class={'shot' + (done.length ? ' done' : '')}>
      <div class="shot-h">
        <span class="mark" aria-hidden="true">{done.length ? '✓' : '○'}</span>
        <button class="link" onClick={() => setOpen(!open)} aria-expanded={open}>{it.title}</button>
        <span class="acts">
          {done.map(ph => <Thumb key={ph.id} ph={ph} small onClick={() => { selPhoto.value = ph.id; }} />)}
          <button title="Снять встроенной камерой" onClick={() => openCameraDialog(it)}>Снять</button>
          <button class="ghost" title="Выбрать файл" onClick={() => void pickPhotos(it)}>Файл</button>
        </span>
      </div>
      {open && <p class="hint shot-hint">{it.hint}</p>}
    </div>
  );
}

export function PhotosPanel() {
  const p = plan.value;
  const items = shotList(p);
  const done = items.filter(it => shotPhotos(p, it.key).length).length;
  const sel = p.photos.find(ph => ph.id === selPhoto.value);
  const big = photosBytes.value > BIG_PROJECT;
  return (
    <>
      <p class="warn">Отключите на телефоне автозагрузку галереи в облако (Google Фото и т. п.): снимки осмотра не должны попадать в интернет. Надёжнее снимать встроенной камерой — её снимки в галерею не попадают.</p>
      <div class="row">
        <button class="primary" onClick={() => openCameraDialog()}>Снять</button>
        <button onClick={() => void pickPhotos()}>+ Из файлов</button>
      </div>
      <p class="hint">Оригиналы хранятся без изменений; у каждого — отпечаток SHA-256, он подтверждает неизменность с момента добавления в проект. Снимки сохраняются в файле .omp.</p>
      {big && <p class="warn">Проект весит {formatSize(photosBytes.value)} — больше 500 МБ. Сохранение и перенос файла будут медленными.</p>}

      <details class="shots" open>
        <summary>Список съёмки — снято {done} из {items.length}</summary>
        <p class="hint" style="margin:4px 0 6px">Нажмите на пункт — появится подсказка, как снимать. Снимок из пункта сам получает вид съёмки и привязку.</p>
        {items.map(it => <ShotRow key={it.key} it={it} />)}
      </details>

      <h3>Снимки ({p.photos.length})</h3>
      {sel && <PhotoCard ph={sel} />}
      {p.photos.length === 0 && <p class="hint">Пока нет.</p>}
      <div class="thumbs">
        {p.photos.map(ph => (
          <div key={ph.id} class="tcell">
            <Thumb ph={ph} onClick={() => { selPhoto.value = ph.id; }} />
            <span class="tl">{ph.kind ? SHOT_KINDS[ph.kind] : '—'}<br />{linkText(p, ph.link)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
