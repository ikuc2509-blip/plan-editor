// Режим «Чистовик» (пока — интерфейс прототипа).
import { loadPlan } from '../../model/migrate';
import { vectorPdf } from '../../export/pdf';
import { sheetPng, sheetSvgFile } from '../../export/image';
import { pickFile, readText, saveFile } from '../../storage/files';
import { plan, replacePlan, toast, zoom } from '../store';
import { Toast } from '../common/Toast';
import { Side } from './Side';
import { PRINT_HINT, Sheet } from './Sheet';

const fname = (ext: string): string => {
  const d = (plan.value.stamp.date || '').replace(/[^\d.]/g, '');
  return `plan${d ? '_' + d : ''}.${ext}`;
};

async function openProject() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let raw: unknown;
  try {
    raw = JSON.parse(await readText(f));
  } catch {
    toast('Это не файл проекта плана (.json)');
    return;
  }
  const r = loadPlan(raw);
  if (!r.ok) { toast(r.error); return; }
  replacePlan(r.plan);
  toast(r.migratedFrom ? 'Проект открыт и переведён в новый формат' : 'Проект открыт');
}

function saveProject() {
  const name = fname('json');
  saveFile(name, JSON.stringify(plan.value, null, 1), 'application/json');
  toast('Файл сохранён: ' + name);
}

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

export function App() {
  return (
    <div class="app">
      <header>
        <h1><span class="dot">1</span>План места происшествия</h1>
        <span class="grow" />
        <button class="ghost" title="Уменьшить" onClick={() => { zoom.value = Math.max(0.4, zoom.value / 1.25); }}>−</button>
        <button class="ghost" onClick={() => { zoom.value = 1; }}>По размеру</button>
        <button class="ghost" title="Увеличить" onClick={() => { zoom.value = Math.min(4, zoom.value * 1.25); }}>+</button>
        <button onClick={openProject}>Открыть проект</button>
        <button onClick={saveProject}>Сохранить проект</button>
        <button onClick={() => exportSheet('svg')} title="Лист в SVG (векторная картинка)">SVG</button>
        <button onClick={() => exportSheet('png')} title="Лист картинкой для вставки в Word">PNG</button>
        <button class="primary" onClick={() => exportSheet('pdf')}>Скачать PDF {plan.value.sheet.paper}</button>
      </header>
      <main>
        <Side />
        <Sheet />
      </main>
      <Toast />
    </div>
  );
}
