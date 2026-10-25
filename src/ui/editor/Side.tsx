// Боковая панель: вкладки Помещение / Стены / Мебель / Метки / Подложка / Штамп.
import { useEffect, useState } from 'preact/hooks';
import type { AutoFound, Callout, Dim, Item, ItemType, Marker, MarkerPlace, Mm, PhotoBox, Plan, WallItem, WallItemType } from '../../model/types';
import { measureList, type MeasureRef, type MeasureRow } from '../../model/measure';
import { formatMeters } from '../../model/units';
import { StatusChip, openMeasure } from '../common/MeasureDialog';
import { IT_TYPES, WI_TYPES } from '../../model/labels';
import { example, uid, emptyPlan } from '../../model/state';
import { annexName, noRoom, rectSizeOf, wallsByLetter } from '../../model/room';
import { drawing, redrawRoom, shaping, startDraw, startShape, straighten, takeTemplate } from '../draw';
import { hasSlanted } from '../../model/actions';
import { parseLength } from '../../model/units';
import * as A from '../../model/actions';
import { SCALES, fitsAt, smallerScaleThatFits } from '../../geometry/unfold';
import { PAPERS, layoutFor } from '../../render/layout';
import { pickFile, readDataUrl } from '../../storage/files';
import { dispatch, endGesture, plan, replacePlan, sel, tab, toast, type TabKey } from '../store';
import { Check, Field, Hint, Len, Num, Select, Text, parseNum } from '../common/fields';
import { stopAutosave } from '../project';
import { clearPhotos } from '../photos';
import { FilePanel } from './FilePanel';
import { PhotosPanel, Thumb, showPhoto, showPhotoBox } from './PhotosPanel';
import { TraceBar, WallPhotosList } from '../common/WallPhotos';
import { openWelcome } from '../common/Welcome';
import { fullMode } from '../mode';
import { SuggestPanel } from '../common/Suggestions';

const TABS: [TabKey, string][] = [['room', 'Помещение'], ['walls', 'Стены'], ['items', 'Мебель'], ['markers', 'Метки'], ['callouts', 'Выноски'], ['measure', 'Замеры'], ['photos', 'Фото'], ['under', 'Подложка'], ['stamp', 'Штамп'], ['file', 'Файл']];

/** Новый план вместо текущего: автосохранение выключаем, чтобы не записать пример поверх файла осмотра */
export async function newPlan(p: Plan, question: string, label: string) {
  const photos = plan.value.photos.length;
  const q = photos ? `${question}

Снимки текущего проекта (${photos}) уберутся из браузера. Если они нужны — сначала «Сохранить в файл».` : question;
  if (!confirm(q)) return;
  await stopAutosave();
  await clearPhotos();
  await replacePlan(p, { label });
}

export const wallOpts = (p: Plan): Record<string, string> => ({
  ...Object.fromEntries(wallsByLetter(p.room).map(w => [w.id, 'Стена ' + w.letter])),
  // стены соседних помещений — для дверей и окон на плане (этап 12)
  ...Object.fromEntries(p.annexes.flatMap(a => a.walls.map(w => [w.id, `${annexName(p, a.id)}: стена ${w.letter}`]))),
});

export function Side() {
  // простой режим — без подложки (этап 11)
  useEffect(() => { if (!fullMode.value && tab.value === 'under') tab.value = 'room'; }, [fullMode.value]);
  // выделенный на листе объект — прокрутить к его карточке
  useEffect(() => {
    const id = sel.value?.id;
    if (id) document.querySelector(`[data-card="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel.value?.id, tab.value]);

  return (
    <aside>
      <div class="tabs" role="tablist">
        {TABS.filter(([k]) => k !== 'under' || fullMode.value).map(([k, n]) => (
          <button key={k} role="tab" aria-selected={k === tab.value} onClick={() => { tab.value = k; }}>{n}</button>
        ))}
      </div>
      <div class="side">
        {tab.value === 'room' && <RoomPanel />}
        {tab.value === 'walls' && <WallsPanel />}
        {tab.value === 'items' && <ItemsPanel />}
        {tab.value === 'markers' && <MarkersPanel />}
        {tab.value === 'callouts' && <CalloutsPanel />}
        {tab.value === 'measure' && <MeasurePanel />}
        {tab.value === 'photos' && <PhotosPanel />}
        {tab.value === 'under' && fullMode.value && <UnderlayPanel />}
        {tab.value === 'stamp' && <StampPanel />}
        {tab.value === 'file' && <FilePanel />}
      </div>
    </aside>
  );
}

/** отметка «замерено / условно» у поля; щелчок — окно замера */
const chip = (d: Dim, mref: MeasureRef) => <StatusChip status={d.status} mref={mref} />;

const cardClass = (id: string) => 'card' + (sel.value?.id === id ? ' sel' : '');

const SCALE_OPTS: Record<'50' | '100' | '200', string> = { '50': '1:50', '100': '1:100', '200': '1:200' };

function RoomPanel() {
  const st = plan.value, lay = layoutFor(st.sheet.paper), sc = st.sheet.mode === 'scale';
  const fits = !sc || fitsAt(st.room, lay.area, st.sheet.scale);
  const better = fits ? null : smallerScaleThatFits(st.room, lay.area, st.sheet.scale);
  const size = rectSizeOf(st.room);
  return (
    <>
      <Hint text="Пока замеров нет — режим «Схематично»: незамеренное на листе будет пустой строкой.">Её впишете от руки. Длины ниже задают только пропорции.</Hint>
      <div class="grid">
        <Select label="Лист" value={st.sheet.paper} options={PAPERS} onValue={v => dispatch(p => A.setSheet(p, { paper: v }))} />
        <Select label="Режим" value={st.sheet.mode} options={{ schematic: 'Схематично', scale: 'В масштабе' }} onValue={v => dispatch(p => A.setSheet(p, { mode: v }))} />
        {sc
          ? <Select label="Масштаб" value={String(st.sheet.scale) as keyof typeof SCALE_OPTS} options={SCALE_OPTS} onValue={v => dispatch(p => A.setSheet(p, { scale: +v }))} />
          : <span />}
      </div>
      {!fits && (
        <div class="warn" style="margin-top:8px">
          {better
            ? <>План в масштабе 1:{st.sheet.scale} не помещается на лист {st.sheet.paper}. Подойдёт 1:{better}. <button class="inline" onClick={() => dispatch(p => A.setSheet(p, { scale: better }))}>Переключить на 1:{better}</button></>
            : <>План не помещается на лист {st.sheet.paper} даже в 1:{SCALES[SCALES.length - 1]}. {st.sheet.paper === 'A4' ? 'Выберите лист A3 или режим «Схематично».' : 'Выберите режим «Схематично».'}</>}
        </div>
      )}
      <RoomShape />
      {size && (
        <>
          <h3>{sc ? 'Размеры помещения, м' : 'Пропорции помещения (условно), м'}</h3>
          <div class="grid">
            <Len label="Длина L" value={size.L.mm} positive onCommit chip={chip(size.L, { t: 'room', key: 'L' })} onValue={mm => dispatch(p => A.setRoomSize(p, { L: mm }))} />
            <Len label="Ширина W" value={size.W.mm} positive onCommit chip={chip(size.W, { t: 'room', key: 'W' })} onValue={mm => dispatch(p => A.setRoomSize(p, { W: mm }))} />
            <Len label="Высота h" value={st.room.height.mm} positive onCommit chip={chip(st.room.height, { t: 'room', key: 'h' })} onValue={mm => dispatch(p => A.setRoomSize(p, { h: mm }))} />
          </div>
        </>
      )}
      {!size && !noRoom(st.room) && <WallLengths />}
      <AnnexList />
      <Hint style="margin-top:6px" text="Отметка над полем — «замерено» или «условно»; щёлкните её, чтобы записать замер.">Там же — чем мерили. Можно писать «12,5», «1250 см» или «12500 мм». Новый размер применяется, когда вы выходите из поля или нажимаете Enter. Условные окна, метки и мебель при этом сдвигаются пропорционально, замеренные остаются на месте. На листе замеренный размер подписывается числом, условный — пустой строкой.</Hint>
      <h3>Отображение</h3>
      <Check label="Привязки меток к стенам" checked={st.sheet.showTies} onValue={v => dispatch(p => A.setSheet(p, { showTies: v }))} />
      <h3>Названия стен</h3>
      {size && <p class="hint">А — сверху, Б — снизу, В — слева, Г — справа от плана пола.</p>}
      <div class="grid two">
        {wallsByLetter(st.room).map(w => (
          <Text key={w.id} label={'Стена ' + w.letter} value={w.name} placeholder="напр. оконная" onValue={v => dispatch(p => A.setWallName(p, w.id, v), 'name:' + w.id)} />
        ))}
      </div>
      <h3>Шаблон</h3>
      <div class="row">
        <button onClick={() => void newPlan(example(), 'Заменить текущий план примером аудитории? Текущий сохранится в истории (вкладка «Файл»).', 'примера аудитории')}>Пример: наша аудитория</button>
        <button onClick={() => void newPlan(emptyPlan(), 'Начать пустой план? Текущий сохранится в истории (вкладка «Файл»).', 'пустого плана')}>Пустой план</button>
        <button class="ghost" onClick={openWelcome}>С чего начать</button>
      </div>
    </>
  );
}

function addWallItem(t: WallItemType) {
  const id = uid();
  dispatch(p => A.addWallItem(p, id, t, 'A'));
  sel.value = { kind: 'wi', id };
}

function WallsPanel() {
  const st = plan.value;
  const order = wallsByLetter(st.room).map(w => w.id);
  const items = [...st.wallItems].sort((a, b) => order.indexOf(a.wallId) - order.indexOf(b.wallId) || a.off.mm - b.off.mm);
  return (
    <>
      <p class="hint">Отступ — от левого угла стены, если стоять в помещении лицом к ней. От пола — высота низа элемента.</p>
      <div class="row">
        <button onClick={() => addWallItem('window')}>+ Окно</button>
        <button onClick={() => addWallItem('door')}>+ Дверь</button>
        <button onClick={() => addWallItem('radiator')}>+ Радиатор</button>
        <button onClick={() => addWallItem('other')}>+ Другое</button>
      </div>
      {fullMode.value && <TraceBar />}
      {fullMode.value && <SuggestPanel />}
      {items.map(it => <WallItemCard key={it.id} it={it} walls={wallOpts(st)} />)}
      {fullMode.value && (
        <>
          <h3>Снимки на развёртке</h3>
          <WallPhotosList recognize />
        </>
      )}
    </>
  );
}

/** Комната: нарисовать, взять заготовку, нарисовать заново (этап 12) */
export function RoomShape() {
  const st = plan.value;
  if (drawing.value) return <p class="warn">Рисуете комнату: щёлкайте по углам на листе. Замкнуть — щелчок по первому углу.</p>;
  if (shaping.value) return <p class="warn">Протяните прямоугольник на листе от угла до угла.</p>;
  if (noRoom(st.room)) {
    return (
      <>
        <h3>Комната</h3>
        <p class="hint">Комнаты пока нет. Нарисуйте её по углам на листе — или возьмите заготовку-прямоугольник.</p>
        <div class="row">
          <button class="primary" onClick={startDraw}>Нарисовать комнату</button>
          <button onClick={() => startShape()}>Прямоугольником</button>
          <button onClick={takeTemplate}>Взять заготовку (прямоугольник)</button>
        </div>
      </>
    );
  }
  return (
    <div class="row" style="margin:10px 0 0">
      {hasSlanted(st) && <button class="primary" onClick={straighten}>Выровнять стены</button>}
      <button onClick={() => startShape(true)} title="Отдельная комната рядом: между ними стена-перегородка">Соседнее помещение</button>
      <button onClick={() => startShape()} title="Ниша, Г-образная комната: прямоугольник сольётся с комнатой">Расширить комнату</button>
      <button class="ghost" onClick={redrawRoom}>Нарисовать комнату заново</button>
    </div>
  );
}

/** Соседние помещения: название, длины стен, «сделать основным», «убрать» (этап 12) */
export function AnnexList() {
  const st = plan.value;
  if (!st.annexes.length) return null;
  return (
    <>
      <h3>Соседние помещения</h3>
      <p class="hint">На плане пола, без развёрток. Развёртки — только у основного помещения; основное можно сменить.</p>
      {st.annexes.map((a, i) => (
        <div class="card" key={a.id} data-card={a.id}>
          <div class="grid">
            <Text label="Название" value={a.name} placeholder={`Помещение ${i + 2}`} wide onValue={v => dispatch(p => A.renameAnnex(p, a.id, v), 'annex:' + a.id)} />
            {a.walls.map(w => (
              <Len key={w.id} label={`Стена ${w.letter}, м`} value={w.length.mm} positive onCommit chip={<StatusChip status={w.length.status} mref={{ t: 'wall', id: w.id }} />}
                onValue={mm => dispatch(p => A.setAnnexWallLength(p, w.id, mm))} />
            ))}
          </div>
          <div class="row" style="margin:6px 0 0">
            <button onClick={() => { dispatch(p => A.makeMain(p, a.id)); toast(`Основное помещение — «${annexName(st, a.id)}»: развёртки теперь у его стен`); }}>Сделать основным</button>
            <button class="del" onClick={() => { if (confirm(`Убрать «${annexName(st, a.id)}»? Отменить можно кнопкой ↶.`)) dispatch(p => A.removeAnnex(p, a.id)); }}>Убрать</button>
          </div>
        </div>
      ))}
    </>
  );
}

/** Длины стен нарисованной комнаты и высота (этап 12) */
export function WallLengths() {
  const st = plan.value;
  return (
    <>
      <h3>Длины стен</h3>
      <div class="grid">
        {st.room.walls.map(w => (
          <Len key={w.id} label={`Стена ${w.letter}, м`} value={w.length.mm} positive onCommit chip={<StatusChip status={w.length.status} mref={{ t: 'wall', id: w.id }} />}
            onValue={mm => dispatch(p => A.setWallLength(p, w.id, mm))} />
        ))}
        <Len label="Высота h" value={st.room.height.mm} positive onCommit chip={<StatusChip status={st.room.height.status} mref={{ t: 'room', key: 'h' }} />} onValue={mm => dispatch(p => A.setRoomSize(p, { h: mm }))} />
      </div>
      <Hint style="margin-top:6px" text="Новая длина стены растягивает комнату; углы можно тянуть мышью на листе.">Комната растягивается по линии через середину стены: всё, что за ней, сдвигается. Условные метки и мебель за этой линией сдвигаются тоже, замеренные остаются на месте.</Hint>
    </>
  );
}

type DimKeys<T> = { [K in keyof T]: T[K] extends { mm: Mm } ? K : never }[keyof T];

export function WallItemCard({ it, walls }: { it: WallItem; walls: Record<string, string> }) {
  const set = (o: Partial<WallItem>) => dispatch(p => A.patch(p, 'wallItems', it.id, o));
  const len = (k: DimKeys<WallItem>) => (mm: Mm) => dispatch(p => A.patchDims(p, 'wallItems', it.id, { [k]: mm }), `wi:${it.id}:${k}`);
  const wiRef = (key: 'off' | 'z' | 'w' | 'h'): MeasureRef => ({ t: 'obj', col: 'wallItems', id: it.id, key });
  // обведено по снимку: условные размеры подписаны «по фото»
  const fromPhoto = it.origin.kind === 'photo';
  const pchip = (d: Dim, r: MeasureRef) => <StatusChip status={d.status} mref={r} photo={fromPhoto} />;
  return (
    <div class={cardClass(it.id)} data-card={it.id}>
      <div class="card-h">
        <Select label="" value={it.type} options={WI_TYPES} onValue={v => set({ type: v })} />
        <button class="del" onClick={() => removeObj('wallItems', it.id)}>Удалить</button>
      </div>
      <div class="grid">
        <Select label="Стена" value={it.wallId} options={walls} onValue={v => set({ wallId: v })} />
        <Text label="Надпись на элементе" value={it.label} onValue={v => dispatch(p => A.patch(p, 'wallItems', it.id, { label: v }), `wi:${it.id}:label`)} />
        <Len label="Отступ, м" value={it.off.mm} chip={pchip(it.off, wiRef('off'))} onValue={len('off')} />
        <Len label="Ширина, м" value={it.w.mm} positive chip={pchip(it.w, wiRef('w'))} onValue={len('w')} />
        <Len label="От пола, м" value={it.z.mm} chip={pchip(it.z, wiRef('z'))} onValue={len('z')} />
        <Len label="Высота, м" value={it.h.mm} positive chip={pchip(it.h, wiRef('h'))} onValue={len('h')} />
      </div>
      {(it.type === 'door' || it.type === 'window') && (
        <div class="grid two" style="margin-top:6px">
          <Select label="Петли" value={it.hinge} options={{ start: 'слева', end: 'справа' }} onValue={v => set({ hinge: v })} />
          {it.type === 'window'
            ? <Check label="Створка открыта" checked={it.open} style="margin-top:14px" onValue={v => set({ open: v })} />
            : <span />}
        </div>
      )}
      {it.origin.kind === 'photo' && <OriginRow photoId={it.origin.photoId} box={it.origin.box} auto={it.origin.auto} />}
    </div>
  );
}

/** Откуда взят объект: снимок и рамка на нём (этап 9) */
function OriginRow({ photoId, box, auto }: { photoId: string; box: PhotoBox; auto?: AutoFound }) {
  const ph = plan.value.photos.find(x => x.id === photoId);
  return (
    <div class="origin">
      <span>
        {ph ? `${auto ? 'По снимку' : 'Обведено по снимку'} № ${ph.n}` : `${auto ? 'По снимку' : 'Обведено по снимку'}, которого уже нет в проекте`}
        {/* этап 10: принято из предложений модели */}
        {auto && ` · предложено моделью, ${Math.round(auto.score * 100)} %`}
      </span>
      {ph && <button class="inline" onClick={() => void showPhotoBox(photoId, box)}>Показать</button>}
    </div>
  );
}

function removeObj(col: 'wallItems' | 'items' | 'markers' | 'callouts', id: string) {
  dispatch(p => A.remove(p, col, id));
  if (sel.value?.id === id) sel.value = null;
}

function ItemCard({ it }: { it: Item }) {
  const len = (k: DimKeys<Item>) => (mm: Mm) => dispatch(p => A.patchDims(p, 'items', it.id, { [k]: mm }), `it:${it.id}:${k}`);
  const itRef = (key: 'x' | 'y' | 'w' | 'd'): MeasureRef => ({ t: 'obj', col: 'items', id: it.id, key });
  return (
    <div class={cardClass(it.id)} data-card={it.id}>
      <div class="card-h">
        <Select<ItemType> label="" value={it.type} options={IT_TYPES} onValue={v => dispatch(p => A.patch(p, 'items', it.id, { type: v }))} />
        <button class="del" onClick={() => removeObj('items', it.id)}>Удалить</button>
      </div>
      <div class="grid">
        <Text label="Надпись на предмете" value={it.label} onValue={v => dispatch(p => A.patch(p, 'items', it.id, { label: v }), `it:${it.id}:label`)} />
        <Len label="X, м" value={it.x.mm} chip={chip(it.x, itRef('x'))} onValue={len('x')} />
        <Len label="Y, м" value={it.y.mm} chip={chip(it.y, itRef('y'))} onValue={len('y')} />
        <Len label="По X, м" value={it.w.mm} positive chip={chip(it.w, itRef('w'))} onValue={len('w')} />
        <Len label="По Y, м" value={it.d.mm} positive chip={chip(it.d, itRef('d'))} onValue={len('d')} />
        <Num label="Поворот, °" value={it.angle} onValue={v => dispatch(p => A.setAngle(p, it.id, v), `it:${it.id}:angle`)} />
      </div>
    </div>
  );
}

const ROWS_DEFAULT = { rows: '10', x0: '2,6', step: '0,85', depth: '0,5', margin: '0,5', aisle: '0,8' };
type RowsText = typeof ROWS_DEFAULT;

function ItemsPanel() {
  const st = plan.value;
  // поля генератора рядов живут только в панели, в план не сохраняются
  const [rows, setRows] = useState<RowsText>(ROWS_DEFAULT);
  const [newType, setNewType] = useState<ItemType>('table');
  const rowField = (k: keyof RowsText, label: string, mode: 'numeric' | 'decimal' = 'decimal') => (
    <Field label={label}>
      <input inputMode={mode} value={rows[k]} onInput={e => setRows({ ...rows, [k]: e.currentTarget.value })} />
    </Field>
  );
  const onGen = () => {
    const mm = (t: string) => { const r = parseLength(t); return r.ok ? r.mm : NaN; };
    const r: A.RowsParams = {
      rows: Math.max(1, Math.round(parseNum(rows.rows))), x0: mm(rows.x0), step: mm(rows.step),
      depth: mm(rows.depth), margin: mm(rows.margin), aisle: mm(rows.aisle),
    };
    if (Object.values(r).some(isNaN)) { toast('Проверьте числа в блоке «Ряды столов»'); return; }
    dispatch(p => A.addRows(p, r, uid));
  };
  const addItem = () => {
    const id = uid();
    dispatch(p => A.addItem(p, id, newType));
    sel.value = { kind: 'it', id };
  };
  const desks = st.items.filter(i => i.type === 'desk').length;
  return (
    <>
      <Hint text="X, Y — левый верхний угол предмета до поворота.">X — от стены В (слева), Y — от стены А (сверху). Поворот — вокруг центра, по часовой стрелке; изголовье кровати, спинка дивана, бачок унитаза — со стороны верхнего края.</Hint>
      <div class="row" style="align-items:flex-end">
        <Select<ItemType> label="Новый предмет" value={newType} options={IT_TYPES} onValue={setNewType} />
        <button onClick={addItem}>+ Добавить</button>
      </div>
      <div class="card">
        <b style="font-size:13px">Ряды столов</b>
        <p class="hint" style="margin:3px 0 6px">Две колонки с центральным проходом.</p>
        <div class="grid">
          {rowField('rows', 'Рядов', 'numeric')}
          {rowField('x0', 'Первый ряд X')}
          {rowField('step', 'Шаг рядов')}
          {rowField('depth', 'Глубина стола')}
          {rowField('margin', 'Отступ от стен')}
          {rowField('aisle', 'Проход')}
        </div>
        <div class="row" style="margin:8px 0 0">
          <button onClick={onGen}>Добавить ряды</button>
          <button class="ghost" onClick={() => dispatch(A.removeDesks)}>Убрать все парты</button>
        </div>
      </div>
      {/* парт много — в списке только выделенная на листе */}
      {st.items.filter(i => i.type !== 'desk' || sel.value?.id === i.id).map(it => <ItemCard key={it.id} it={it} />)}
      {desks > 0 && <p class="hint">Парт на плане: {desks}. Чтобы поправить одну, кликните её на листе.</p>}
    </>
  );
}

export const PLACES: Record<MarkerPlace, string> = { floor: 'на полу / мебели', wall: 'на стене', outside: 'вне помещения' };

function MarkersPanel() {
  const st = plan.value;
  const walls = wallOpts(st);
  const addMarker = () => {
    const id = uid();
    dispatch(p => A.addMarker(p, id, 'A'));
    sel.value = { kind: 'mk', id };
  };
  return (
    <>
      <p class="hint">Номера меток — как в протоколе и фототаблице. Отступ на стене — от левого угла, если стоять лицом к стене.</p>
      <div class="row"><button onClick={addMarker}>+ Метка</button></div>
      {st.markers.map(m => <MarkerCard key={m.id} m={m} walls={walls} />)}
    </>
  );
}

export function MarkerCard({ m, walls }: { m: Marker; walls: Record<string, string> }) {
  const set = (o: Partial<Marker>, key?: string) => dispatch(p => A.patch(p, 'markers', m.id, o), key);
  const len = (k: DimKeys<Marker>) => (mm: Mm) => dispatch(p => A.patchDims(p, 'markers', m.id, { [k]: mm }), `mk:${m.id}:${k}`);
  const mkRef = (key: 'x' | 'y' | 'off' | 'z'): MeasureRef => ({ t: 'obj', col: 'markers', id: m.id, key });
  return (
    <div class={cardClass(m.id)} data-card={m.id}>
      <div class="card-h">
        <span class="mk">{m.n}</span>
        <span style="flex:1" />
        <button class="del" onClick={() => removeObj('markers', m.id)}>Удалить</button>
      </div>
      <div class="grid">
        <Text label="№" value={m.n} onValue={v => set({ n: v }, `mk:${m.id}:n`)} />
        <Select label="Где" value={m.place} options={PLACES} onValue={v => set({ place: v })} />
        {m.place === 'floor' ? (
          <>
            <Len label="X, м" value={m.x.mm} chip={chip(m.x, mkRef('x'))} onValue={len('x')} />
            <Len label="Y, м" value={m.y.mm} chip={chip(m.y, mkRef('y'))} onValue={len('y')} />
          </>
        ) : (
          <>
            <Select label="Стена" value={m.wallId} options={walls} onValue={v => set({ wallId: v })} />
            <Len label="Отступ, м" value={m.off.mm} chip={chip(m.off, mkRef('off'))} onValue={len('off')} />
            {m.place === 'wall' && <Len label="От пола, м" value={m.z.mm} chip={chip(m.z, mkRef('z'))} onValue={len('z')} />}
          </>
        )}
        <Text label="Описание" value={m.desc} wide area onValue={v => set({ desc: v }, `mk:${m.id}:desc`)} />
      </div>
      <MarkerPhotos id={m.id} />
    </div>
  );
}

function CalloutCard({ c }: { c: Callout }) {
  return (
    <div class={cardClass(c.id)} data-card={c.id}>
      <div class="card-h">
        <span style="flex:1;font-size:12.5px;color:var(--muted)">Выноска</span>
        <button class="del" onClick={() => removeObj('callouts', c.id)}>Удалить</button>
      </div>
      <Text label="Текст" value={c.text} wide area placeholder="напр. следы волочения" onValue={v => dispatch(p => A.patch(p, 'callouts', c.id, { text: v }), `co:${c.id}:text`)} />
    </div>
  );
}

function CalloutsPanel() {
  const add = () => {
    const id = uid();
    dispatch(p => A.addCallout(p, id));
    sel.value = { kind: 'co', id };
  };
  return (
    <>
      <p class="hint">Выноска — текст со стрелкой к любому месту плана, в том числе к развёртке стен. На листе перетаскивайте текст, а кончик стрелки — за синий кружок.</p>
      <div class="row"><button onClick={add}>+ Выноска</button></div>
      {plan.value.callouts.map(c => <CalloutCard key={c.id} c={c} />)}
    </>
  );
}

function MeasureRowView({ r }: { r: MeasureRow }) {
  const ok = r.dim.status === 'measured';
  // обведённое по снимку — «≈ 1,42 м (по фото)» (decisions.md)
  const photo = r.sel?.kind === 'wi' && plan.value.wallItems.find(i => i.id === r.sel!.id)?.origin.kind === 'photo';
  const open = () => { if (r.sel) sel.value = r.sel; openMeasure(r.ref); };
  return (
    <div class="mrow">
      <span class="w">{r.title} — {r.what}</span>
      <span class="v">{(ok ? '' : '≈ ') + formatMeters(r.mm) + ' м' + (!ok && photo ? ' (по фото)' : '')}</span>
      <button class={ok ? 'ghost' : ''} onClick={open}>{ok ? 'Изменить' : 'Ввести'}</button>
    </div>
  );
}

export function MeasurePanel() {
  const st = plan.value;
  const [showAll, setShowAll] = useState(false);
  const rows = measureList(st);
  const done = rows.filter(r => r.dim.status === 'measured').length;
  const shown = rows.filter(r => showAll || r.dim.status !== 'measured');
  const groups = ['Помещение', 'Окна и двери', 'Метки'] as const;
  return (
    <>
      <p class="hint">Что есть на плане, но ещё не замерено. «≈» — значение нанесено на глаз. На листе замеренное подписывается числом, условное — пустой строкой.</p>
      <b style="font-size:13px">Замерено {done} из {rows.length}</b>
      <div class="meter" role="progressbar" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={done}><i style={{ width: (rows.length ? (100 * done) / rows.length : 0) + '%' }} /></div>
      <Check label="Показать и замеренное" checked={showAll} onValue={setShowAll} />
      {shown.length === 0 && <p class="hint">Всё замерено.</p>}
      {groups.map(g => {
        const list = shown.filter(r => r.group === g);
        return list.length ? (
          <div key={g}>
            <h3>{g}</h3>
            {list.map(r => <MeasureRowView key={JSON.stringify(r.ref)} r={r} />)}
          </div>
        ) : null;
      })}
      <h3>Приборы</h3>
      <p class="hint">Для строки в примечаниях «Замеры произведены: …». Не вписано — на листе останется пустая строка.</p>
      <div class="grid two">
        <Text label="Рулетка — какая" value={st.instruments.tape} placeholder="измерительная 5 м" onValue={v => dispatch(p => A.setInstruments(p, { tape: v }), 'instr:tape')} />
        <Text label="Лазерный дальномер — модель" value={st.instruments.rangefinder} placeholder="Bosch GLM 50-27" onValue={v => dispatch(p => A.setInstruments(p, { rangefinder: v }), 'instr:range')} />
      </div>
    </>
  );
}

/** Снимки метки — значками; щелчок — карточка снимка на вкладке «Фото» */
function MarkerPhotos({ id }: { id: string }) {
  const list = plan.value.photos.filter(ph => ph.link.kind === 'marker' && ph.link.markerId === id);
  if (!list.length) return <p class="hint" style="margin:6px 0 0">Снимков нет — вкладка «Фото».</p>;
  return (
    <div class="mk-photos">
      <span class="hint" style="margin:0">Снимки:</span>
      {list.map(ph => <Thumb key={ph.id} ph={ph} small onClick={() => showPhoto(ph.id)} />)}
    </div>
  );
}

function UnderlayPanel() {
  const u = plan.value.underlay;
  const pick = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    const src = await readDataUrl(f);
    dispatch(p => A.setUnderlay(p, { src, show: true }));
  };
  return (
    <>
      <p class="hint">Подложите фото или скан под план пола: снимок сверху, эскиз от руки, план БТИ. Обведите поверх мебелью и метками, затем скройте подложку.</p>
      <div class="row">
        <button onClick={pick}>{u.src ? 'Заменить изображение' : 'Загрузить изображение'}</button>
        {u.src && <button class="ghost" onClick={() => dispatch(p => A.setUnderlay(p, { src: '' }))}>Убрать</button>}
      </div>
      {u.src && (
        <>
          <Check label="Показывать подложку" checked={u.show} onValue={v => dispatch(p => A.setUnderlay(p, { show: v }))} />
          <Field label="Прозрачность" wide>
            <input type="range" min="0.05" max="1" step="0.05" value={u.opacity} onPointerUp={endGesture}
              onInput={e => { const v = parseNum(e.currentTarget.value); dispatch(p => A.setUnderlay(p, { opacity: v }), 'underlay:opacity'); }} />
          </Field>
          <div class="grid" style="margin-top:6px">
            <Num label="Масштаб, %" value={u.scale} onValue={v => dispatch(p => A.setUnderlay(p, { scale: v }), 'underlay:scale')} />
            <Len label="Сдвиг X, м" value={u.dx} onValue={mm => dispatch(p => A.setUnderlay(p, { dx: mm }), 'underlay:dx')} />
            <Len label="Сдвиг Y, м" value={u.dy} onValue={mm => dispatch(p => A.setUnderlay(p, { dy: mm }), 'underlay:dy')} />
          </div>
          <p class="hint" style="margin-top:8px">Подложка попадает и в PDF. Перед печатью скройте её.</p>
        </>
      )}
    </>
  );
}

function StampPanel() {
  const st = plan.value, stamp = st.stamp;
  const set = (k: keyof typeof stamp) => (v: string) => dispatch(p => A.setStamp(p, { [k]: v }), 'stamp:' + k);
  return (
    <>
      <div class="grid two">
        <Text label="Наименование" value={stamp.name} wide onValue={set('name')} />
        <Text label="Объект" value={stamp.object} wide onValue={set('object')} />
        <Text label="Подзаголовок" value={stamp.protocol} wide area onValue={set('protocol')} />
        <Text label="Составил (роль и ФИО)" value={stamp.author} wide placeholder="следователь Иванов И. И." onValue={set('author')} />
        <Text label="Участники" value={stamp.members} wide onValue={set('members')} />
        <Text label="Дата" value={stamp.date} onValue={set('date')} />
        <Text label="Север, градусы" value={st.north} placeholder="пусто = вписать от руки" onValue={v => dispatch(p => A.setNorth(p, v), 'north')} />
      </div>
      <p class="hint" style="margin-top:6px">Север: 0 — вверх листа, 90 — вправо.</p>
      <h3>Дополнительные примечания</h3>
      <Text label="По одному на строку" value={st.notes} wide area onValue={v => dispatch(p => A.setNotes(p, v), 'notes')} />
    </>
  );
}
