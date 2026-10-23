// Режим «Чистовик» (компьютер): шапка с файлом, экспортом, отменой, масштабом и сеткой.
import { useEffect, useState } from 'preact/hooks';
import { vectorPdf } from '../../export/pdf';
import { sheetPng, sheetSvgFile } from '../../export/image';
import { saveFile } from '../../storage/files';
import { saveStatusText } from '../../storage/history';
import { GRID_STEPS, canRedo, canUndo, dirtySince, dispatch, fileSavedAt, gridStep, plan, redo, sel, tab, toast, undo, zoom } from '../store';
import { remove } from '../../model/actions';
import { autosave, openFile, saveToFile } from '../project';
import { Toast } from '../common/Toast';
import { PasswordDialog } from '../common/PasswordDialog';
import { UpdateBar } from '../common/UpdateBar';
import { MeasureDialog } from '../common/MeasureDialog';
import { CameraDialog } from '../common/CameraDialog';
import { RectifyDialog } from '../common/RectifyDialog';
import { PhotoViewer } from './PhotosPanel';
import { BIG_PROJECT, formatSize } from '../../photos/meta';
import { photosBytes } from '../photos';
import { Side } from './Side';
import { PRINT_HINT, Sheet, ZOOM_MAX, ZOOM_MIN } from './Sheet';
import { setMode } from '../mode';

const fname = (ext: string): string => {
  const d = (plan.value.stamp.date || '').replace(/[^\d.]/g, '');
  return `plan${d ? '_' + d : ''}.${ext}`;
};

/** Экспорт листа: файл готовится, затем отдаётся пользователю */
async function exportSheet(ext: 'pdf' | 'png' | 'svg') {
  toast(ext === 'pdf' ? 'Готовлю PDF…' : 'Готовлю файл…');
  try {
    const p = plan.value, name = fname(ext);
    if (ext === 'pdf') saveFile(name, await vectorPdf(p));
    else if (ext === 'png') saveFile(name, await sheetPng(p));
    else saveFile(name, await sheetSvgFile(p), 'image/svg+xml');
    toast(ext === 'pdf' ? `Файл сохранён: ${name}. ${PRINT_HINT}` : 'Файл сохранён: ' + name);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'Не удалось сохранить файл');
  }
}

/** Индикатор в шапке: «Не сохранено в файл 12 мин»; щелчок — вкладка «Файл» */
function SaveStatus() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const dirty = dirtySince.value !== null;
  const auto = autosave.value;
  const text = auto?.state === 'on' && !dirty ? 'Автосохранение в файл' : saveStatusText(dirtySince.value, fileSavedAt.value, Math.max(now, dirtySince.value ?? 0));
  return (
    <button class={'status' + (dirty ? ' dirty' : '')} title="Вкладка «Файл»" onClick={() => { tab.value = 'file'; }}>
      {text}{auto && auto.state !== 'on' ? ' · автосохранение приостановлено' : ''}
    </button>
  );
}

const COL = { wi: 'wallItems', it: 'items', mk: 'markers', co: 'callouts' } as const;

/** в полях ввода клавиши работают как обычно (отмена набора, удаление букв) */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** Ctrl+Z — отменить, Ctrl+Y или Ctrl+Shift+Z — повторить, Delete — удалить выделенное */
function onKey(e: KeyboardEvent) {
  if (typing(e.target)) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  // по коду клавиши: при русской раскладке e.key — «я» и «н»
  const z = k === 'z' || e.code === 'KeyZ', y = k === 'y' || e.code === 'KeyY';
  if (mod && z && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (y || (z && e.shiftKey))) { e.preventDefault(); redo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.value) {
    e.preventDefault();
    const s = sel.value;
    dispatch(p => remove(p, COL[s.kind], s.id));
    sel.value = null;
  }
}

const GRID_NAMES: Record<string, string> = { 0: 'нет', 10: '1 см', 50: '5 см', 100: '10 см' };

export function App() {
  useEffect(() => {
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="app">
      <header>
        <h1><span class="dot">1</span>План места происшествия</h1>
        <button class="ghost" title="Пошаговый режим для телефона" onClick={() => setMode('onsite')}>На месте</button>
        <SaveStatus />
        {plan.value.photos.length > 0 && (
          <span class={'weight' + (photosBytes.value > BIG_PROJECT ? ' big' : '')} title="Снимки проекта; больше 500 МБ — файл переносить и сохранять медленно">
            Проект: {formatSize(photosBytes.value)}
          </span>
        )}
        <span class="grow" />
        <button class="ghost" title="Отменить (Ctrl+Z)" aria-label="Отменить" disabled={!canUndo.value} onClick={undo}>↶</button>
        <button class="ghost" title="Повторить (Ctrl+Y)" aria-label="Повторить" disabled={!canRedo.value} onClick={redo}>↷</button>
        <button class="ghost" title="Уменьшить" onClick={() => { zoom.value = Math.max(ZOOM_MIN, zoom.value / 1.25); }}>−</button>
        <button class="ghost" onClick={() => { zoom.value = 1; }}>По размеру</button>
        <button class="ghost" title="Увеличить" onClick={() => { zoom.value = Math.min(ZOOM_MAX, zoom.value * 1.25); }}>+</button>
        <label class="gridsel" title="Привязка к сетке при перетаскивании; Alt — без привязки">Сетка
          <select value={gridStep.value} onChange={e => { gridStep.value = +e.currentTarget.value; }}>
            {GRID_STEPS.map(v => <option key={v} value={v}>{GRID_NAMES[v]}</option>)}
          </select>
        </label>
        <button onClick={openFile}>Открыть файл</button>
        <button onClick={saveToFile}>Сохранить в файл</button>
        <button onClick={() => exportSheet('svg')} title="Лист в SVG (векторная картинка)">SVG</button>
        <button onClick={() => exportSheet('png')} title="Лист картинкой для вставки в Word">PNG</button>
        <button class="primary" onClick={() => exportSheet('pdf')}>Скачать PDF {plan.value.sheet.paper}</button>
        <UpdateBar />
      </header>
      <main>
        <Side />
        <Sheet />
      </main>
      <Toast />
      <PasswordDialog />
      <MeasureDialog />
      <CameraDialog />
      <RectifyDialog />
      <PhotoViewer />
    </div>
  );
}
