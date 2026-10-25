// «С чего начать» (этап 11): при первом запуске — сам, потом — кнопкой. Новичок не должен
// принять учебный пример за свой осмотр.
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import * as A from '../../model/actions';
import { emptyPlan } from '../../model/state';
import { savePref } from '../../storage/prefs';
import { replacePlan, tab } from '../store';
import { newPlan } from '../editor/Side';
import { uiMode } from '../mode';
import { step, today } from '../onsite/state';

/** окно открыто; first — первый запуск: на экране учебный пример, а не чей-то осмотр */
export const welcomeOpen = signal<{ first: boolean } | null>(null);

export const openWelcome = (): void => { welcomeOpen.value = { first: false }; };

function close() {
  welcomeOpen.value = null;
  savePref('welcomed', true);
}

/** «Начать новый осмотр»: пустой план с сегодняшней датой, первый шаг */
async function startNew(first: boolean) {
  close();
  const p = A.setStamp(emptyPlan(), { date: today() });
  // на экране пример — заменяем молча; иначе — с вопросом, как кнопка «Новый осмотр»
  if (first) await replacePlan(p, { label: 'нового осмотра' });
  else await newPlan(p, 'Начать новый осмотр с пустого плана? Текущий план сохранится в истории состояний.', 'нового осмотра');
  step.value = 'room';
  tab.value = 'room';
}

export function WelcomeDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const open = welcomeOpen.value;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const onsite = uiMode.value === 'onsite';
  return (
    <dialog ref={ref} class="pw welcome" onCancel={e => { e.preventDefault(); close(); }}>
      {open && (
        <>
          <h3>С чего начать</h3>
          <ul>
            {onsite
              ? <li><b>На месте</b> — шаги внизу экрана идут по порядку осмотра: Помещение → Проёмы → Метки → Фото → Замеры → Итог. Переходить можно в любом порядке.</li>
              : <li><b>Чистовик</b> — полный редактор: мебель, выноски, штамп, PDF для печати. На телефоне — режим «На месте», шаг за шагом.</li>}
            <li>Не замерили — впишите размер на глаз: на листе будет пустая строка «____ м», впишете от руки.</li>
            <li>Номера меток — как в протоколе и на бирках; приложение их само не меняет.</li>
            <li>Всё хранится только в этом браузере. Надёжная копия — файл <b>.omp</b>: {onsite ? 'шаг «Итог» → «Сохранить проект»' : '«Сохранить в файл»'}.</li>
          </ul>
          {open.first && <p class="hint">Сейчас открыт учебный пример — аудитория на ул. Широкой, 33.{onsite ? ' Вернуть его можно в «Чистовике»: вкладка «Помещение» → «Пример».' : ' Вернуть его можно кнопкой «Пример: наша аудитория» на вкладке «Помещение».'}</p>}
          <div class="row" style="margin:0">
            <button class="primary" onClick={() => void startNew(open.first)}>Начать новый осмотр</button>
            <button onClick={close}>{open.first ? 'Посмотреть пример' : 'Закрыть'}</button>
          </div>
        </>
      )}
    </dialog>
  );
}
