// Вкладка «Файл»: сохранение, пароль, автосохранение, история состояний.
import { fsaSupported } from '../../storage/fsa';
import type { Snapshot } from '../../storage/db';
import { HISTORY_MAX } from '../../storage/history';
import { PASSWORD_WARNING } from '../common/PasswordDialog';
import { Check } from '../common/fields';
import { PackPanel } from '../common/Suggestions';
import { autosave, changePassword, openFile, resumeAutosave, saveToFile, setProtect, stopAutosave } from '../project';
import { meta, persisted, protect, replacePlan, snapshots } from '../store';
import { APP_VERSION, checkState, checkUpdates, install, installPrompt, offlineReady, standalone, updateVersion } from '../../pwa/register';

const time = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function restore(s: Snapshot) {
  if (!confirm(`Вернуть план к состоянию от ${time(s.at)}? Текущий план сначала сохранится в историю.`)) return;
  await replacePlan(s.plan, { label: 'возврата к состоянию', meta: meta.value, dirty: true });
}

export function FilePanel() {
  const a = autosave.value;
  return (
    <>
      <p class="hint">Проект — один файл <b>.omp</b>. Его переносят на флешке или по USB-кабелю. Внутри обычный ZIP-архив: план и снимки (папка photos/ — оригиналы без изменений).</p>
      <div class="row">
        <button class="primary" onClick={saveToFile}>Сохранить в файл</button>
        <button onClick={openFile}>Открыть файл</button>
      </div>
      <p class="hint">Сохранений этого проекта: {meta.value.saveNumber}. Номер стоит в конце имени файла.</p>

      <h3>Пароль</h3>
      <Check label="Защитить файл паролем" checked={protect.value} onValue={v => void setProtect(v)} />
      {protect.value && (
        <>
          <p class="warn">{PASSWORD_WARNING}</p>
          <p class="hint">Пароль не сохраняется: после перезапуска приложение спросит его при следующем сохранении. В имени файла с паролем нет адреса объекта.</p>
          <div class="row"><button onClick={changePassword}>Сменить пароль</button></div>
        </>
      )}

      <h3>Автосохранение в файл</h3>
      {!fsaSupported() && <p class="hint">В этом браузере нет записи в выбранный файл — сохраняйте кнопкой «Сохранить в файл». Работает в Chrome и Edge на компьютере.</p>}
      {fsaSupported() && !a && <p class="hint">После «Сохранить в файл» изменения будут сами записываться в выбранный файл.</p>}
      {a && (
        <div class="card">
          <div><b>{a.name}</b></div>
          {a.state === 'on' && <p class="hint" style="margin:4px 0 6px">Изменения записываются в этот файл через несколько секунд после правки.</p>}
          {a.state === 'needs-permission' && <p class="warn" style="margin:6px 0">Браузер просит заново разрешить запись в файл.</p>}
          {a.state === 'needs-password' && <p class="warn" style="margin:6px 0">Файл защищён паролем — введите его, чтобы продолжить.</p>}
          {a.state === 'error' && <p class="warn" style="margin:6px 0">Не удалось записать в файл. Сохраните заново кнопкой «Сохранить в файл».</p>}
          <div class="row" style="margin:0">
            {a.state !== 'on' && <button onClick={resumeAutosave}>Продолжить автосохранение</button>}
            <button class="ghost" onClick={stopAutosave}>Выключить</button>
          </div>
        </div>
      )}

      <h3>История состояний</h3>
      <p class="hint">Последние {HISTORY_MAX}: раз в 5 минут, если были изменения, и перед каждой заменой плана. Хранятся в этом браузере.</p>
      {snapshots.value.length === 0 && <p class="hint">Пока пусто.</p>}
      {snapshots.value.map(s => (
        <div class="snap" key={s.id}>
          <span>{time(s.at)} — {s.label}</span>
          <button class="ghost" onClick={() => void restore(s)}>Вернуть</button>
        </div>
      ))}

      <PackPanel />

      <h3>Хранение в браузере</h3>
      <p class="hint">
        {persisted.value === true && 'Браузер обещал не удалять данные приложения сам. '}
        {persisted.value === false && 'Браузер может удалить данные приложения при нехватке места. '}
        Рабочая копия — только на этом устройстве и в этом браузере. Надёжная копия — файл .omp.
      </p>

      <h3>Приложение</h3>
      <p class="hint">
        Версия {APP_VERSION}.{' '}
        {offlineReady.value ? 'Работает без интернета: файлы приложения сохранены в браузере.' : 'Без интернета заработает после первого полного открытия сайта.'}
        {' '}Новая версия включается только кнопкой «Обновить» в шапке.
      </p>
      <div class="row">
        <button disabled={checkState.value === 'checking'} onClick={() => void checkUpdates()}>
          {checkState.value === 'checking' ? 'Проверяю…' : 'Проверить обновления'}
        </button>
      </div>
      {checkState.value === 'latest' && <p class="hint">Установлена последняя версия.</p>}
      {checkState.value === 'found' && <p class="hint">Новая версия {updateVersion.value} скачана — нажмите «Обновить» в жёлтой полосе вверху.</p>}
      {checkState.value === 'failed' && <p class="hint">Не удалось проверить: нет интернета. Попробуйте, когда сеть появится.</p>}
      {checkState.value === 'unavailable' && <p class="hint">Проверка работает только в опубликованном приложении после первого полного открытия.</p>}
      {standalone.value && <p class="hint">Открыто как установленное приложение.</p>}
      {!standalone.value && installPrompt.value && <div class="row"><button onClick={() => void install()}>Установить приложение</button></div>}
      {!standalone.value && (
        <p class="hint">
          Установить: на компьютере в Chrome или Edge — значок «Установить» справа в адресной строке; на Android в Chrome — меню ⋮ → «Добавить на главный экран» → «Установить». Значок «План ОМП» появится рядом с другими программами.
        </p>
      )}
    </>
  );
}
