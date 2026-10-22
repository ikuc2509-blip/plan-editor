// Боковая панель: вкладки Помещение / Стены / Мебель / Метки / Подложка / Штамп.
import { useEffect, useState } from 'preact/hooks';
import type { Item, ItemType, MarkerPlace, WallItem, WallItemType, WallKey } from '../../model/types';
import { IT_TYPES, WALLS, WALL_KEYS, WI_TYPES } from '../../model/labels';
import { blank, example, genRows, uid, type RowsParams } from '../../model/state';
import { geom } from '../../geometry/unfold';
import { pickFile, readDataUrl } from '../../storage/files';
import { patch, plan, remove, replacePlan, sel, tab, toast, update, type TabKey } from '../store';
import { Check, Field, Num, Select, Text, parseNum } from '../common/fields';

const TABS: [TabKey, string][] = [['room', 'Помещение'], ['walls', 'Стены'], ['items', 'Мебель'], ['markers', 'Метки'], ['under', 'Подложка'], ['stamp', 'Штамп']];

const wallOpts = Object.fromEntries(WALL_KEYS.map(k => [k, 'Стена ' + WALLS[k]])) as Record<WallKey, string>;

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
  const st = plan.value, g = geom(st.room), sc = st.room.mode === 'scale';
  return (
    <>
      <p class="hint">Пока замеров нет, оставьте «схематично»: размеры на листе будут пустыми строками, впишете от руки. Длины ниже задают только пропорции.</p>
      <div class="grid two">
        <Select label="Режим" value={st.room.mode} options={{ schematic: 'Схематично, без размеров', scale: 'В масштабе' }} onValue={v => update(s => { s.room.mode = v; })} />
        {sc
          ? <Select label="Масштаб" value={String(st.room.scale) as '50' | '100' | '200'} options={{ 50: '1:50', 100: '1:100', 200: '1:200' }} onValue={v => update(s => { s.room.scale = +v; })} />
          : <span />}
      </div>
      {sc && !g.fits && <p class="warn" style="margin-top:8px">План в этом масштабе не помещается на лист A3. Выберите масштаб мельче.</p>}
      <h3>{sc ? 'Размеры помещения, м' : 'Пропорции помещения (условно), м'}</h3>
      <div class="grid">
        <Num label="Длина L" value={st.room.L} onValue={v => update(s => { s.room.L = v; })} />
        <Num label="Ширина W" value={st.room.W} onValue={v => update(s => { s.room.W = v; })} />
        <Num label="Высота h" value={st.room.h} onValue={v => update(s => { s.room.h = v; })} />
      </div>
      <h3>Отображение</h3>
      <Check label="Подписывать размеры (в масштабе)" checked={st.room.showDims} onValue={v => update(s => { s.room.showDims = v; })} />
      <Check label="Привязки меток к стенам" checked={st.room.showTies} onValue={v => update(s => { s.room.showTies = v; })} />
      <h3>Названия стен</h3>
      <p class="hint">А — сверху, Б — снизу, В — слева, Г — справа от плана пола.</p>
      <div class="grid two">
        {WALL_KEYS.map(k => (
          <Text key={k} label={'Стена ' + WALLS[k]} value={st.wallNames[k]} placeholder="напр. оконная" onValue={v => update(s => { s.wallNames[k] = v; })} />
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

const WALL_ORDER: WallKey[] = ['A', 'B', 'V', 'G'];

function addWallItem(t: WallItemType) {
  const o: WallItem = {
    id: uid(), wall: 'A', type: t, label: '', off: 0.5,
    z: t === 'door' ? 0 : t === 'radiator' ? 0.15 : 0.9,
    w: t === 'door' ? 1 : 1.2,
    h: t === 'door' ? 2.1 : t === 'radiator' ? 0.6 : 1.5,
    open: false, hinge: 'start',
  };
  update(s => { s.wallItems.push(o); });
  sel.value = { kind: 'wi', id: o.id };
}

function WallsPanel() {
  const items = [...plan.value.wallItems].sort((a, b) => WALL_ORDER.indexOf(a.wall) - WALL_ORDER.indexOf(b.wall) || a.off - b.off);
  return (
    <>
      <p class="hint">Отступ — от левого края стены на развёртке (для В и Г — от стены А). От пола — высота низа элемента.</p>
      <div class="row">
        <button onClick={() => addWallItem('window')}>+ Окно</button>
        <button onClick={() => addWallItem('door')}>+ Дверь</button>
        <button onClick={() => addWallItem('radiator')}>+ Радиатор</button>
        <button onClick={() => addWallItem('other')}>+ Другое</button>
      </div>
      {items.map(it => <WallItemCard key={it.id} it={it} />)}
    </>
  );
}

function WallItemCard({ it }: { it: WallItem }) {
  const set = (p: Partial<WallItem>) => patch('wallItems', it.id, p);
  return (
    <div class={cardClass(it.id)} data-card={it.id}>
      <div class="card-h">
        <Select label="" value={it.type} options={WI_TYPES} onValue={v => set({ type: v })} />
        <button class="del" onClick={() => remove('wallItems', it.id)}>Удалить</button>
      </div>
      <div class="grid">
        <Select label="Стена" value={it.wall} options={wallOpts} onValue={v => set({ wall: v })} />
        <Text label="Подпись" value={it.label} onValue={v => set({ label: v })} />
        <Num label="Отступ, м" value={it.off} onValue={v => set({ off: v })} />
        <Num label="Ширина, м" value={it.w} onValue={v => set({ w: v })} />
        <Num label="От пола, м" value={it.z} onValue={v => set({ z: v })} />
        <Num label="Высота, м" value={it.h} onValue={v => set({ h: v })} />
      </div>
      {(it.type === 'door' || it.type === 'window') && (
        <div class="grid two" style="margin-top:6px">
          <Select label="Петли" value={it.hinge} options={{ start: 'у начала', end: 'у конца' }} onValue={v => set({ hinge: v })} />
          {it.type === 'window'
            ? <Check label="Створка открыта" checked={it.open} style="margin-top:14px" onValue={v => set({ open: v })} />
            : <span />}
        </div>
      )}
    </div>
  );
}

function ItemCard({ it }: { it: Item }) {
  const set = (p: Partial<Item>) => patch('items', it.id, p);
  return (
    <div class={cardClass(it.id)} data-card={it.id}>
      <div class="card-h">
        <Select<ItemType> label="" value={it.type} options={IT_TYPES} onValue={v => set({ type: v })} />
        <button class="del" onClick={() => remove('items', it.id)}>Удалить</button>
      </div>
      <div class="grid">
        <Text label="Подпись" value={it.label} onValue={v => set({ label: v })} />
        <Num label="X, м" value={it.x} onValue={v => set({ x: v })} />
        <Num label="Y, м" value={it.y} onValue={v => set({ y: v })} />
        <Num label="По X, м" value={it.w} onValue={v => set({ w: v })} />
        <Num label="По Y, м" value={it.d} onValue={v => set({ d: v })} />
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
    const p: RowsParams = {
      rows: Math.max(1, Math.round(parseNum(rows.rows))), x0: parseNum(rows.x0), step: parseNum(rows.step),
      depth: parseNum(rows.depth), margin: parseNum(rows.margin), aisle: parseNum(rows.aisle),
    };
    if (Object.values(p).some(isNaN)) { toast('Проверьте числа в блоке «Ряды столов»'); return; }
    update(s => genRows(s, p));
  };
  const addItem = () => {
    const o: Item = { id: uid(), type: 'table', label: '', x: st.room.L / 2 - 0.4, y: st.room.W / 2 - 0.4, w: 0.8, d: 0.8 };
    update(s => { s.items.push(o); });
    sel.value = { kind: 'it', id: o.id };
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
          <button class="ghost" onClick={() => update(s => { s.items = s.items.filter(i => i.type !== 'desk'); })}>Убрать все парты</button>
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
  const addMarker = () => {
    const n = String(st.markers.reduce((m, k) => Math.max(m, parseInt(k.n) || 0), 0) + 1);
    const o = { id: uid(), n, desc: '', place: 'floor' as const, x: st.room.L / 2, y: st.room.W / 2, wall: 'A' as const, off: 1, z: 1 };
    update(s => { s.markers.push(o); });
    sel.value = { kind: 'mk', id: o.id };
  };
  return (
    <>
      <p class="hint">Номера меток — как в протоколе и фототаблице.</p>
      <div class="row"><button onClick={addMarker}>+ Метка</button></div>
      {st.markers.map(m => {
        const set = (p: Partial<typeof m>) => patch('markers', m.id, p);
        return (
          <div key={m.id} class={cardClass(m.id)} data-card={m.id}>
            <div class="card-h">
              <span class="mk">{m.n}</span>
              <span style="flex:1" />
              <button class="del" onClick={() => remove('markers', m.id)}>Удалить</button>
            </div>
            <div class="grid">
              <Text label="№" value={m.n} onValue={v => set({ n: v })} />
              <Select label="Где" value={m.place} options={PLACES} onValue={v => set({ place: v })} />
              {m.place === 'floor' ? (
                <>
                  <Num label="X, м" value={m.x} onValue={v => set({ x: v })} />
                  <Num label="Y, м" value={m.y} onValue={v => set({ y: v })} />
                </>
              ) : (
                <>
                  <Select label="Стена" value={m.wall} options={wallOpts} onValue={v => set({ wall: v })} />
                  <Num label="Отступ, м" value={m.off} onValue={v => set({ off: v })} />
                  {m.place === 'wall' && <Num label="От пола, м" value={m.z} onValue={v => set({ z: v })} />}
                </>
              )}
              <Text label="Описание" value={m.desc} wide area onValue={v => set({ desc: v })} />
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
    update(s => { s.underlay.src = src; s.underlay.show = true; });
  };
  return (
    <>
      <p class="hint">Подложите фото или скан под план пола: снимок сверху, эскиз от руки, план БТИ. Обведите поверх мебелью и метками, затем скройте подложку.</p>
      <div class="row">
        <button onClick={pick}>{u.src ? 'Заменить изображение' : 'Загрузить изображение'}</button>
        {u.src && <button class="ghost" onClick={() => update(s => { s.underlay.src = ''; })}>Убрать</button>}
      </div>
      {u.src && (
        <>
          <Check label="Показывать подложку" checked={u.show} onValue={v => update(s => { s.underlay.show = v; })} />
          <Field label="Прозрачность" wide>
            <input type="range" min="0.05" max="1" step="0.05" value={u.opacity} onInput={e => { const v = parseNum(e.currentTarget.value); update(s => { s.underlay.opacity = v; }); }} />
          </Field>
          <div class="grid" style="margin-top:6px">
            <Num label="Масштаб, %" value={u.scale} onValue={v => update(s => { s.underlay.scale = v; })} />
            <Num label="Сдвиг X, м" value={u.dx} onValue={v => update(s => { s.underlay.dx = v; })} />
            <Num label="Сдвиг Y, м" value={u.dy} onValue={v => update(s => { s.underlay.dy = v; })} />
          </div>
          <p class="hint" style="margin-top:8px">Подложка попадает и в PDF. Перед печатью скройте её.</p>
        </>
      )}
    </>
  );
}

function StampPanel() {
  const st = plan.value, stamp = st.stamp;
  const set = (k: keyof typeof stamp) => (v: string) => update(s => { s.stamp[k] = v; });
  return (
    <>
      <div class="grid two">
        <Text label="Наименование" value={stamp.name} wide onValue={set('name')} />
        <Text label="Объект" value={stamp.object} wide onValue={set('object')} />
        <Text label="Подзаголовок" value={stamp.protocol} wide area onValue={set('protocol')} />
        <Text label="Составил" value={stamp.author} wide onValue={set('author')} />
        <Text label="Участники" value={stamp.members} wide onValue={set('members')} />
        <Text label="Дата" value={stamp.date} onValue={set('date')} />
        <Text label="Север, градусы" value={st.north} placeholder="пусто = вписать от руки" onValue={v => update(s => { s.north = v; })} />
      </div>
      <p class="hint" style="margin-top:6px">Север: 0 — вверх листа, 90 — вправо.</p>
      <h3>Дополнительные примечания</h3>
      <Text label="По одному на строку" value={st.notes} wide area onValue={v => update(s => { s.notes = v; })} />
    </>
  );
}
