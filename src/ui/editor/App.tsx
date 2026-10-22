// Режим «Чистовик» (пока — интерфейс прототипа).
import { loadPlan } from '../../model/migrate';
import { sheetSvg } from '../../render/sheet';
import { rasterPdf } from '../../export/pdf';
import { pickFile, readText, saveFile } from '../../storage/files';
import { plan, replacePlan, toast, zoom } from '../store';
import { Toast } from '../common/Toast';
import { Side } from './Side';
import { Sheet } from './Sheet';

const fname = (ext: string): string => {
  const d = (plan.value.stamp.date || '').replace(/[^\d.]/g, '');
  return `plan${d ? '_' + d : ''}.${ext}`;
};

function saved(name: string) {
  toast('Файл сохранён: ' + name);
}

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
  toast(r.migratedFrom === 'prototype' ? 'Проект прототипа открыт и переведён в новый формат' : 'Проект открыт');
}

function saveProject() {
  const name = fname('json');
  saveFile(name, JSON.stringify(plan.value, null, 1), 'application/json');
  saved(name);
}

function saveSvg() {
  const name = fname('svg');
  saveFile(name, sheetSvg(plan.value), 'image/svg+xml');
  saved(name);
}

async function savePdf() {
  toast('Готовлю PDF…');
  try {
    const name = fname('pdf');
    saveFile(name, await rasterPdf(sheetSvg(plan.value)));
    saved(name);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'Не удалось сделать PDF');
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
        <button onClick={saveSvg}>SVG</button>
        <button class="primary" onClick={savePdf}>Скачать PDF A3</button>
      </header>
      <main>
        <Side />
        <Sheet />
      </main>
      <Toast />
    </div>
  );
}
