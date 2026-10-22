// Полоса «Доступна новая версия»: приложение обновляется только по этой кнопке.
import { useState } from 'preact/hooks';
import { applyUpdate, updateVersion } from '../../pwa/register';
import { flushWork, toast } from '../store';

export function UpdateBar() {
  const v = updateVersion.value;
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const go = async () => {
    setBusy(true);
    try {
      await applyUpdate(flushWork);
    } catch {
      setBusy(false);
      toast('Не удалось обновить. Попробуйте позже — работа не потеряна.');
    }
  };
  return (
    <div class="update" role="status">
      <span>Доступна новая версия {v}. Перед обновлением план сохранится в браузере; файл .omp не меняется.</span>
      <button class="primary" disabled={busy} onClick={() => void go()}>{busy ? 'Обновляю…' : 'Обновить'}</button>
    </div>
  );
}
