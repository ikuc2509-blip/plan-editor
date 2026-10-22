// Боковая панель: вкладки Помещение / Стены / Мебель / Метки / Подложка / Штамп.
import { useEffect, useState } from 'preact/hooks';
import type { Item, ItemType, Marker, MarkerPlace, Mm, Plan, WallItem, WallItemType } from '../../model/types';
import { IT_TYPES, WI_TYPES } from '../../model/labels';
import { blank, example, uid } from '../../model/state';
import { rectSize, wallsByLetter } from '../../model/room';
import { parseLength } from '../../model/units';
import * as A from '../../model/actions';
import { geom } from '../../geometry/unfold';
import { pickFile, readDataUrl } from '../../storage/files';
import { dispatch, endGesture, plan, replacePlan, sel, tab, toast, type TabKey } from '../store';
import { Check, Field, Len, Num, Select, Text, parseNum } from '../common/fields';

const TABS: [TabKey, string][] = [['room', 'Помещение'], ['walls', 'Стены'], ['items', 'Мебель'], ['markers', 'Метки'], ['under', 'Подложка'], ['stamp', 'Штамп']];

const wallOpts = (p: Plan): Record<string, string> =>
  Object.fromEntries(wallsByLetter(p.room).map(w => [w.id, 'Стена ' + w.letter]));

export function Side() {
  // выделенный на листе объект — прокрутить к его карточке
  useEffect(() => {
    const id = sel.value?.id;
    if (id) document.querySelector(`[data-card="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel.value?.id, tab.value]);

  return (
    <aside>
      <div class="tabs" role="tablist">
        {TABS.map(([k, n]) => (
          <button key={k} role="tab" aria-selected={k === tab.value} onClick={() => { tab.value = k; }}>{n}</button>
        ))}
      </div>
      <div class="side">
        {tab.value === 'room' && <RoomPanel />}
        {tab.value === 'walls' && <WallsPanel />}
        {tab.value === 'items' && <ItemsPanel />}
        {tab.value === 'markers' && <MarkersPanel />}
        {tab.value === 'under' && <UnderlayPanel />}
        {tab.value === 'stamp' && <StampPanel />}
      </div>
    </aside>
  );
}

const cardClass = (id: string) => 'card' + (sel.value?.id === id ? ' sel' : '');

function RoomPanel() {
  const st = plan.value, g = geom(st.room, st.sheet), sc = st.sheet.mode === 'scale';
  const { L, W } = rectSize(st.room);
  return (
    <>
      <p class="hint">Пока замеров нет, оставьте «схематично»: размеры на листе будут пустыми строками, впишете от руки. Длины ниже задают только пропорции.</p>
      <div class="grid two">
        <Select label="Режим" value={st.sheet.mode} options={{ schematic: 'Схематично, без размеров', scale: 'В масштабе' }} onValue={v => dispatch(p => A.setSheet(p, { mode: v }))} />
        {sc
          ? <Select label="Масштаб" value={String(st.sheet.scale) as '50' | '100' | '200'} options={{ 50: '1:50', 100: '1:100', 200: '1:200' }} onValue={v => dispatch(p => A.setSheet(p, { scale: +v }))} />
          : <span />}
      </div>
      {sc && !g.fits && <p class="warn" style="margin-top:8px">План в этом масштабе не помещается на лист A3. Выберите масштаб мельче.</p>}
      <h3>{sc ? 'Размеры помещения, м' : 'Пропорции помещения (условно), м'}</h3>
      <div class="grid">
        <Len label="Длина L" value={L.mm} positive onCommit onValue={mm => dispatch(p => A.setRoomSize(p, { L: mm }))} />
        <Len label="Ширина W" value={W.mm} positive onCommit onValue={mm => dispatch(p => A.setRoomSize(p, { W: mm }))} />
        <Len label="Высота h" value={st.room.height.mm} positive onCommit onValue={mm => dispatch(p => A.setRoomSize(p, { h: mm }))} />
      </div>
      <p class="hint" style="margin-top:6px">Можно писать «12,5», «1250 см» или «12500 мм». Новый размер применяется, когда вы выходите из поля или нажимаете Enter. Условные окна, метки и мебель при этом сдвигаются пропорционально, замеренные остаются на месте.</p>
      <h3>Отображение</h3>
      <Check label="Подписывать размеры (в масштабе)" checked={st.sheet.showDims} onValue={v => dispatch(p => A.setSheet(p, { showDims: v }))} />
      <Check label="Привязки меток к стенам" checked={st.sheet.showTies} onValue={v => dispatch(p => A.setSheet(p, { showTies: v }))} />
      <h3>Названия стен</h3>
      <p class="hint">А — сверху, Б — снизу, В — слева, Г — справа от плана пола.</p>
      <div class="grid two">
        {wallsByLetter(st.room).map(w => (
          <Text key={w.id} label={'Стена ' + w.letter} value={w.name} placeholder="напр. оконная" onValue={v => dispatch(p => A.setWallName(p, w.id, v), 'name:' + w.id)} />
        ))}
      </div>
      <h3>Шаблон</h3>
      <div class="row">
        <button onClick={() => { if (confirm('Заменить текущий план примером аудитории?')) replacePlan(example()); }}>Пример: наша аудитория</button>
        <button onClick={() => { if (confirm('Начать пустой план? Текущий будет заменён.')) replacePlan(blank()); }}>Пустой план</button>
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
      {items.map(it => <WallItemCard key={it.id} it={it} walls={wallOpts(st)} />)}
    </>
  );
}

type DimKeys<T> = { [K in keyof T]: T[K] extends { mm: Mm } ? K : never }[keyof T];

function WallItemCard({ it, walls }: { it: WallItem; walls: Record<string, string> }) {
  const set = (o: Partial<WallItem>) => dispatch(p => A.patch(p, 'wallItems', it.id, o));
  const len = (k: DimKeys<WallItem>) => (mm: Mm) => dispatch(p => A.patchDims(p, 'wallItems', it.id, { [k]: mm }), `wi:${it.id}:${k}`);
  return (
    <div class={cardClass(it.id)} data-card={it.id}>
      <div class="card-h">
        <Select label="" value={it.type} options={WI_TYPES} onValue={v => set({ type: v })} />
        <button class="del" onClick={() => removeObj('wallItems', it.id)}>Удалить</button>
      </div>
      <div class="grid">
        <Select label="Стена" value={it.wallId} options={walls} onValue={v => set({ wallId: v })} />
        <Text label="Подпись" value={it.label} onValue={v => dispatch(p => A.patch(p, 'wallItems', it.id, { label: v }), `wi:${it.id}:label`)} />
        <Len label="Отступ, м" value={it.off.mm} onValue={len('off')} />
        <Len label="Ширина, м" value={it.w.mm} positive onValue={len('w')} />
        <Len label="От пола, м" value={it.z.mm} onValue={len('z')} />
        <Len label="Высота, м" value={it.h.mm} positive onValue={len('h')} />
      </div>
      {(it.type === 'door' || it.type === 'window') && (
        <div class="grid two" style="margin-top:6px">
          <Select label="Петли" value={it.hinge} options={{ start: 'слева', end: 'справа' }} onValue={v => set({ hinge: v })} />
          {it.type === 'window'
            ? <Check label="Створка открыта" checked={it.open} style="margin-top:14px" onValue={v => set({ open: v })} />
            : <span />}
        </div>
      )}
    </div>
  );
}

function removeObj(col: 'wallItems' | 'items' | 'markers', id: string) {
  dispatch(p => A.remove(p, col, id));
  if (sel.value?.id === id) sel.value = null;
}

function ItemCard({ it }: { it: Item }) {
  const len = (k: DimKeys<Item>) => (mm: Mm) => dispatch(p => A.patchDims(p, 'items', it.id, { [k]: mm }), `it:${it.id}:${k}`);
  return (
    <div class={cardClass(it.id)} data-card={it.id}>
      <div class="card-h">
        <Select<ItemType> label="" value={it.type} options={IT_TYPES} onValue={v => dispatch(p => A.patch(p, 'items', it.id, { type: v }))} />
        <button class="del" onClick={() => removeObj('items', it.id)}>Удалить</button>
      </div>
      <div class="grid">
        <Text label="Подпись" value={it.label} onValue={v => dispatch(p => A.patch(p, 'items', it.id, { label: v }), `it:${it.id}:label`)} />
        <Len label="X, м" value={it.x.mm} onValue={len('x')} />
        <Len label="Y, м" value={it.y.mm} onValue={len('y')} />
        <Len label="По X, м" value={it.w.mm} positive onValue={len('w')} />
        <Len label="По Y, м" value={it.d.mm} positive onValue={len('d')} />
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
    dispatch(p => A.addItem(p, id));
    sel.value = { kind: 'it', id };
  };
  const desks = st.items.filter(i => i.type === 'desk').length;
  return (
    <>
      <p class="hint">X — от стены В (слева), Y — от стены А (сверху). Размеры по X и по Y.</p>
      <div class="row"><button onClick={addItem}>+ Предмет</button></div>
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

const PLACES: Record<MarkerPlace, string> = { floor: 'на полу / мебели', wall: 'на стене', outside: 'вне помещения' };

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
      {st.markers.map(m => {
        const set = (o: Partial<Marker>, key?: string) => dispatch(p => A.patch(p, 'markers', m.id, o), key);
        const len = (k: DimKeys<Marker>) => (mm: Mm) => dispatch(p => A.patchDims(p, 'markers', m.id, { [k]: mm }), `mk:${m.id}:${k}`);
        return (
          <div key={m.id} class={cardClass(m.id)} data-card={m.id}>
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
                  <Len label="X, м" value={m.x.mm} onValue={len('x')} />
                  <Len label="Y, м" value={m.y.mm} onValue={len('y')} />
                </>
              ) : (
                <>
                  <Select label="Стена" value={m.wallId} options={walls} onValue={v => set({ wallId: v })} />
                  <Len label="Отступ, м" value={m.off.mm} onValue={len('off')} />
                  {m.place === 'wall' && <Len label="От пола, м" value={m.z.mm} onValue={len('z')} />}
                </>
              )}
              <Text label="Описание" value={m.desc} wide area onValue={v => set({ desc: v }, `mk:${m.id}:desc`)} />
            </div>
          </div>
        );
      })}
    </>
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
        <Text label="Составил" value={stamp.author} wide onValue={set('author')} />
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
