import { render } from 'preact';
import { App } from './ui/editor/App';
import { dirtySince, initStore } from './ui/store';
import { initAutosave } from './ui/project';
import { initOffline, reloadingForUpdate } from './pwa/register';
import './ui/styles.css';

// рабочая копия грузится из браузера до показа интерфейса
await initStore();
await initAutosave();
initOffline();

// напоминание при закрытии вкладки, если есть несохранённое в файл
window.addEventListener('beforeunload', e => {
  if (dirtySince.value !== null && !reloadingForUpdate) e.preventDefault();
});

render(<App />, document.getElementById('app')!);
