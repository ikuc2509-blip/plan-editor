// Какой интерфейс показать: «На месте» (телефон) или «Чистовик» (компьютер).
import { App } from './editor/App';
import { OnsiteApp } from './onsite/OnsiteApp';
import { uiMode } from './mode';

export function Root() {
  return uiMode.value === 'onsite' ? <OnsiteApp /> : <App />;
}
