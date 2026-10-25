import { render } from 'preact';
import { Root } from './ui/Root';
import { dirtySince, initStore } from './ui/store';
import { initAutosave } from './ui/project';
import { initOffline, reloadingForUpdate } from './pwa/register';
import { initWallImages } from './ui/rectify';
import { welcomeOpen } from './ui/common/Welcome';
import { loadPref } from './storage/prefs';
import './ui/styles.css';

// рабочая копия грузится из браузера до показа интерфейса
const firstRun = await initStore();
await initAutosave();
initOffline();
initWallImages();
// первый запуск — окно «С чего начать» (этап 11)
if (firstRun && !loadPref('welcomed', false, (v): v is boolean => typeof v === 'boolean')) welcomeOpen.value = { first: true };

// напоминание при закрытии вкладки, если есть несохранённое в файл
window.addEventListener('beforeunload', e => {
  if (dirtySince.value !== null && !reloadingForUpdate) e.preventDefault();
});

render(<Root />, document.getElementById('app')!);
