import { render } from 'preact';
import { Root } from './ui/Root';
import { dirtySince, initStore } from './ui/store';
import { initAutosave } from './ui/project';
import { initOffline, reloadingForUpdate } from './pwa/register';
import { initWallImages } from './ui/rectify';
import './ui/styles.css';

// рабочая копия грузится из браузера до показа интерфейса
await initStore();
await initAutosave();
initOffline();
initWallImages();

// напоминание при закрытии вкладки, если есть несохранённое в файл
window.addEventListener('beforeunload', e => {
  if (dirtySince.value !== null && !reloadingForUpdate) e.preventDefault();
});

render(<Root />, document.getElementById('app')!);
