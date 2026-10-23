// Панели шагов «На месте»: Помещение → Проёмы → Метки → Фото → Замеры → Осмотр завершён.
// Поля и карточки — те же, что в «Чистовике»; здесь только порядок и крупный вид.
import { useEffect, useState } from 'preact/hooks';
import type { WallItemType } from '../../model/types';
import * as A from '../../model/actions';
import { WI_TYPES } from '../../model/labels';
import { measureList } from '../../model/measure';
import { rectSize, wallsByLetter } from '../../model/room';
import { blank, uid } from '../../model/state';
import { formatMeters } from '../../model/units';
import { shotList, shotPhotos } from '../../photos/shots';
import { vectorPdf } from '../../export/pdf';
import { saveFile } from '../../storage/files';
import { dispatch, dirtySince, fileSavedAt, plan, protect, sel, toast } from '../store';
import { Check, Len, Text } from '../common/fields';
import { StatusChip } from '../common/MeasureDialog';
import { openFile, saveToFile, setProtect } from '../project';
import { MarkerCard, MeasurePanel, WallItemCard, newPlan, wallOpts } from '../editor/Side';
import { PhotosPanel } from '../editor/PhotosPanel';
import { schematicView } from '../editor/Sheet';
import { WallPhotosList } from '../common/WallPhotos';
import { placing, step, today } from './state';

/** выделенная карточка — прокрутить к ней (выбрали касанием плана) */
function useScrollToSel() {
  useEffect(() => {
    const id = sel.value?.id;
    if (id) document.querySelector(`[data-card="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel.value?.id]);
}

export function RoomStep() {
  const st = plan.value, stamp = st.stamp;
  const { L, W } = rectSize(st.room);
  // дата осмотра по умолчанию — сегодня (decisions.md, этап 8)
  useEffect(() => { if (!plan.value.stamp.date) dispatch(p => A.setStamp(p, { date: today() })); }, []);
  const set = (k: 'object' | 'date' | 'author') => (v: string) => dispatch(p => A.setStamp(p, { [k]: v }), 'stamp:' + k);
  const fresh = () => {
    const p = blank();
    void newPlan(A.setStamp(p, { date: today() }), 'Начать новый осмотр с пустого плана? Текущий план сохранится в истории состояний.', 'нового осмотра');
  };
  return (
    <>
      <div class="row">
        <button onClick={fresh}>Новый осмотр</button>
        <button class="ghost" onClick={openFile}>Открыть файл</button>
      </div>
      <h3>Для штампа</h3>
      <div class="grid one">
        <Text label="Адрес, помещение" value={stamp.object} placeholder="ул. Широкая, 33, ауд. 214" onValue={set('object')} />
        <Text label="Дата" value={stamp.date} onValue={set('date')} />
        <Text label="Составил (роль и ФИО)" value={stamp.author} placeholder="следователь Иванов И. И." onValue={set('author')} />
      </div>
      <h3>Размеры, м</h3>
      <div class="grid">
        <Len label="Длина L" value={L.mm} positive onCommit chip={<StatusChip status={L.status} mref={{ t: 'room', key: 'L' }} />} onValue={mm => dispatch(p => A.setRoomSize(p, { L: mm }))} />
        <Len label="Ширина W" value={W.mm} positive onCommit chip={<StatusChip status={W.status} mref={{ t: 'room', key: 'W' }} />} onValue={mm => dispatch(p => A.setRoomSize(p, { W: mm }))} />
        <Len label="Высота h" value={st.room.height.mm} positive onCommit chip={<StatusChip status={st.room.height.status} mref={{ t: 'room', key: 'h' }} />} onValue={mm => dispatch(p => A.setRoomSize(p, { h: mm }))} />
      </div>
      <p class="hint" style="margin-top:8px">Пока не замерили — впишите на глаз: это только пропорции, на схеме будет пустая строка «____ м». Замер — нажмите «условно» над полем. «125 см» тоже можно.</p>
    </>
  );
}

const ADD_WI: [WallItemType, string][] = [['door', '+ Дверь'], ['window', '+ Окно'], ['radiator', '+ Радиатор'], ['other', '+ Другое']];

export function OpeningsStep() {
  useScrollToSel();
  const st = plan.value;
  const walls = wallsByLetter(st.room);
  const cur = sel.value?.kind === 'wi' ? st.wallItems.find(i => i.id === sel.value!.id) : undefined;
  const [wall, setWall] = useState(cur?.wallId ?? walls[0]!.id);
  // выбрали проём на плане — переключиться на его стену
  useEffect(() => { if (cur) setWall(cur.wallId); }, [cur?.id, cur?.wallId]);
  const onWall = st.wallItems.filter(i => i.wallId === wall).sort((a, b) => a.off.mm - b.off.mm);
  const add = (t: WallItemType) => {
    const id = uid();
    dispatch(p => A.addWallItem(p, id, t, wall));
    sel.value = { kind: 'wi', id };
  };
  return (
    <>
      <p class="hint">Выберите стену, затем добавьте, что на ней есть. Отступ — от левого угла стены, если стоять в помещении лицом к ней. Положение можно поправить пальцем на плане.</p>
      <div class="os-pick" role="group" aria-label="Стена">
        {walls.map(w => {
          const n = st.wallItems.filter(i => i.wallId === w.id).length;
          return (
            <button key={w.id} aria-pressed={w.id === wall} onClick={() => { setWall(w.id); if (cur && cur.wallId !== w.id) sel.value = null; }}>
              Стена {w.letter}{n ? <span class="cnt">{n}</span> : null}
            </button>
          );
        })}
      </div>
      <div class="row">
        {ADD_WI.map(([t, label]) => <button key={t} onClick={() => add(t)}>{label}</button>)}
      </div>
      {onWall.length === 0 && <p class="hint">На этой стене пока ничего нет.</p>}
      {onWall.length > 0 && (
        <div class="os-pick" role="group" aria-label="Что на стене">
          {onWall.map((it, i) => (
            <button key={it.id} aria-pressed={it.id === cur?.id} onClick={() => { sel.value = { kind: 'wi', id: it.id }; }}>
              {WI_TYPES[it.type]}{onWall.filter(o => o.type === it.type).length > 1 ? ' ' + (onWall.filter((o, j) => o.type === it.type && j <= i).length) : ''}
            </button>
          ))}
        </div>
      )}
      {cur && cur.wallId === wall && <WallItemCard it={cur} walls={wallOpts(st)} />}
      {!cur && onWall.length > 0 && <p class="hint">Нажмите на проём выше или на плане, чтобы поправить размеры.</p>}
      <h3>Снимки на этой стене</h3>
      <WallPhotosList wallId={wall} />
    </>
  );
}

export function MarkersStep() {
  useScrollToSel();
  const st = plan.value;
  const cur = sel.value?.kind === 'mk' ? st.markers.find(m => m.id === sel.value!.id) : undefined;
  return (
    <>
      <div class="row">
        <button class={placing.value ? '' : 'primary'} onClick={() => { placing.value = !placing.value; }}>
          {placing.value ? 'Отмена' : '+ Новая метка'}
        </button>
      </div>
      {placing.value
        ? <p class="warn">Коснитесь плана там, где обнаружен предмет: на полу или на развёртке стены. Метка встанет туда «условно» — точное место потом по замеру.</p>
        : <p class="hint">Номера — как в протоколе и на бирках; приложение их само не меняет. Метку на плане можно передвинуть пальцем.</p>}
      {st.markers.length > 0 && (
        <div class="os-pick" role="group" aria-label="Метки">
          {st.markers.map(m => (
            <button key={m.id} class="mkb" aria-pressed={m.id === cur?.id} title={m.desc} onClick={() => { sel.value = { kind: 'mk', id: m.id }; }}>
              <span class="mk">{m.n}</span>{m.desc ? <span class="d">{m.desc}</span> : null}
            </button>
          ))}
        </div>
      )}
      {cur && <MarkerCard m={cur} walls={wallOpts(st)} />}
      {!cur && st.markers.length > 0 && !placing.value && <p class="hint">Нажмите на метку выше или на плане, чтобы вписать описание.</p>}
    </>
  );
}

export const PhotosStep = PhotosPanel;
export const MeasureStep = MeasurePanel;

async function schemePdf() {
  toast('Готовлю PDF…');
  try {
    const p = plan.value;
    const d = (p.stamp.date || '').replace(/[^\d.]/g, '');
    const name = `plan${d ? '_' + d : ''}.pdf`;
    saveFile(name, await vectorPdf(schematicView(p)));
    toast('Файл сохранён: ' + name);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'Не удалось сохранить файл');
  }
}

const time = (ms: number) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function FinishStep() {
  const p = plan.value;
  const rows = measureList(p);
  const measured = rows.filter(r => r.dim.status === 'measured').length;
  const shots = shotList(p);
  const shot = shots.filter(it => shotPhotos(p, it.key).length).length;
  const noDesc = p.markers.filter(m => !m.desc.trim()).length;
  const { L, W } = rectSize(p.room);
  const missing = [!p.stamp.object.trim() && 'адрес', !p.stamp.date.trim() && 'дата', !p.stamp.author.trim() && '«Составил»'].filter(Boolean);
  const dirty = dirtySince.value !== null;
  return (
    <>
      <ul class="os-sum">
        <li>Помещение {formatMeters(L.mm)} × {formatMeters(W.mm)} × {formatMeters(p.room.height.mm)} м</li>
        <li>Проёмов и элементов стен: {p.wallItems.length}</li>
        <li>Меток: {p.markers.length}{noDesc ? ` (без описания: ${noDesc})` : ''}</li>
        <li>Снимков: {p.photos.length}; по списку съёмки снято {shot} из {shots.length}</li>
        <li>Замерено {measured} из {rows.length}{measured < rows.length && <> — <button class="inline" onClick={() => { step.value = 'measure'; }}>к замерам</button></>}</li>
      </ul>
      {missing.length > 0 && (
        <p class="warn">Для штампа не заполнено: {missing.join(', ')}. <button class="inline" onClick={() => { step.value = 'room'; }}>Шаг «Помещение»</button></p>
      )}

      <h3>1. Сохранить проект</h3>
      <p class={dirty ? 'warn' : 'hint'}>
        {dirty ? 'Есть изменения, которые ещё не сохранены в файл.' : fileSavedAt.value ? `Сохранено в файл в ${time(fileSavedAt.value)}.` : 'Проект ещё не сохранялся в файл.'}
        {' '}Файл .omp — план и все снимки; его потом открывают дома в «Чистовике».
      </p>
      <div class="row"><button class="primary" onClick={saveToFile}>Сохранить проект (.omp)</button></div>
      <Check label="Защитить файл паролем" checked={protect.value} onValue={v => void setProtect(v)} />

      <h3>2. Схема для протокола</h3>
      <p class="hint">PDF без масштаба: замеренное подписано числом, незамеренное — пустой строкой «____ м», её впишете от руки.</p>
      <div class="row"><button onClick={() => void schemePdf()}>PDF-схема</button></div>

      <h3>3. Перенести файл на компьютер</h3>
      <p class="hint">На телефоне файлы попадают в папку «Загрузки» (Download).</p>
      <details class="os-how">
        <summary>По USB-кабелю</summary>
        <ol>
          <li>Подключите телефон к компьютеру кабелем.</li>
          <li>На телефоне опустите шторку уведомлений, нажмите «Зарядка по USB» и выберите «Передача файлов».</li>
          <li>На компьютере откройте Проводник → ваш телефон → внутренняя память → Download.</li>
          <li>Скопируйте файл «ОМП_….omp» на компьютер, например в «Документы».</li>
          <li>На компьютере откройте приложение, кнопка «Открыть файл» — выберите этот файл.</li>
        </ol>
      </details>
      <details class="os-how">
        <summary>Через флешку (переходник OTG)</summary>
        <ol>
          <li>Вставьте флешку в телефон через переходник OTG (USB-C — USB).</li>
          <li>Откройте приложение «Файлы» → «Загрузки».</li>
          <li>Нажмите и подержите файл «ОМП_….omp» → «Копировать» → выберите флешку.</li>
          <li>Вставьте флешку в компьютер и откройте файл кнопкой «Открыть файл».</li>
        </ol>
      </details>
      <p class="warn">Не пересылайте файл через мессенджеры, почту и облачные диски: материалы осмотра — тайна следствия (ст. 161 УПК РФ).</p>
    </>
  );
}
