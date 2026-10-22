// Режим «Чистовик» (пока — интерфейс прототипа).
import { useEffect, useState } from 'preact/hooks';
import { vectorPdf } from '../../export/pdf';
import { sheetPng, sheetSvgFile } from '../../export/image';
import { saveFile } from '../../storage/files';
import { saveStatusText } from '../../storage/history';
import { dirtySince, fileSavedAt, plan, tab, toast, zoom } from '../store';
import { autosave, openFile, saveToFile } from '../project';
import { Toast } from '../common/Toast';
import { PasswordDialog } from '../common/PasswordDialog';
import { Side } from './Side';
import { PRINT_HINT, Sheet } from './Sheet';

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

export function App() {
  return (
    <div class="app">
      <header>
        <h1><span class="dot">1</span>План места происшествия</h1>
        <SaveStatus />
        <span class="grow" />
        <button class="ghost" title="Уменьшить" onClick={() => { zoom.value = Math.max(0.4, zoom.value / 1.25); }}>−</button>
        <button class="ghost" onClick={() => { zoom.value = 1; }}>По размеру</button>
        <button class="ghost" title="Увеличить" onClick={() => { zoom.value = Math.min(4, zoom.value * 1.25); }}>+</button>
        <button onClick={openFile}>Открыть файл</button>
        <button onClick={saveToFile}>Сохранить в файл</button>
        <button onClick={() => exportSheet('svg')} title="Лист в SVG (векторная картинка)">SVG</button>
        <button onClick={() => exportSheet('png')} title="Лист картинкой для вставки в Word">PNG</button>
        <button class="primary" onClick={() => exportSheet('pdf')}>Скачать PDF {plan.value.sheet.paper}</button>
      </header>
      <main>
        <Side />
        <Sheet />
      </main>
      <Toast />
      <PasswordDialog />
    </div>
  );
}
