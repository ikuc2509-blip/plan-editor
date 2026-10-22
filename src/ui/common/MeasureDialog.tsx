// Окно замера: число, «замерено / условно», чем мерили. Открывается щелчком по размеру
// на листе, отметкой у поля в карточке или строкой чек-листа.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DimStatus, MeasureMethod } from '../../model/types';
import { METHODS, METHODS_V1, applyMeasure, readMeasure, tieOf, type MeasureRef } from '../../model/measure';
import { rectSize } from '../../model/room';
import { formatMeters, parseLength } from '../../model/units';
import { loadPref, savePref } from '../../storage/prefs';
import { dispatch, plan } from '../store';

const measuring = signal<MeasureRef | null>(null);

/** чем мерили в прошлый раз — подставляется в новое окно */
const isMethod = (v: unknown): v is MeasureMethod => METHODS_V1.includes(v as MeasureMethod);
let lastMethod: MeasureMethod = loadPref('method', 'tape', isMethod);

export function openMeasure(ref: MeasureRef): void {
  measuring.value = ref;
}

export function MeasureDialog() {
  const ref = measuring.value;
  const dlg = useRef<HTMLDialogElement>(null);
  const info = ref ? readMeasure(plan.value, ref) : null;
  const [text, setText] = useState('');
  const [status, setStatus] = useState<DimStatus>('measured');
  const [method, setMethod] = useState<MeasureMethod>(lastMethod);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (ref && info) {
      setText(formatMeters(info.mm));
      // окно открывают, чтобы записать замер: по умолчанию «замерено»
      setStatus('measured');
      setMethod(info.dim.status === 'measured' && info.dim.method && isMethod(info.dim.method) ? info.dim.method : lastMethod);
      setErr(null);
      if (!d.open) d.showModal();
      setTimeout(() => { const i = d.querySelector('input'); i?.focus(); i?.select(); }, 30);
    } else if (d.open) d.close();
  }, [ref]);

  const close = () => { measuring.value = null; };
  const submit = (e: Event) => {
    e.preventDefault();
    if (!ref) return;
    const r = parseLength(text);
    if (!r.ok) { setErr(r.error); return; }
    if (r.mm < 0) { setErr('Расстояние не может быть отрицательным'); return; }
    if (status === 'measured') { lastMethod = method; savePref('method', method); }
    dispatch(p => applyMeasure(p, ref, r.mm, status, method));
    close();
  };

  // привязка к дальней стене считается от длины или ширины помещения
  let farHint: string | null = null;
  if (ref?.t === 'tie') {
    const m = plan.value.markers.find(k => k.id === ref.id);
    const size = rectSize(plan.value.room)[ref.axis === 'x' ? 'L' : 'W'];
    if (m && tieOf(plan.value, m, ref.axis).far && size.status !== 'measured') {
      farHint = `Сначала замерьте ${ref.axis === 'x' ? 'длину L' : 'ширину W'} помещения: положение метки от дальней стены считается от неё.`;
    }
  }

  return (
    <dialog ref={dlg} class="pw" onCancel={e => { e.preventDefault(); close(); }}>
      {ref && info && (
        <form onSubmit={submit}>
          <h3>{info.title} — {info.what}</h3>
          {farHint && <p class="warn">{farHint}</p>}
          <label class="f wide"><span>Значение, м</span>
            <input inputMode="decimal" value={text} onInput={e => { setText(e.currentTarget.value); setErr(null); }} />
          </label>
          <div class="seg" role="radiogroup" aria-label="Статус">
            <label class="chk"><input type="radio" name="st" checked={status === 'measured'} onChange={() => setStatus('measured')} />замерено</label>
            <label class="chk"><input type="radio" name="st" checked={status === 'conditional'} onChange={() => setStatus('conditional')} />условно (на глаз, по фото)</label>
          </div>
          {status === 'measured' && (
            <label class="f wide"><span>Чем мерили</span>
              <select value={method} onChange={e => setMethod(e.currentTarget.value as MeasureMethod)}>
                {METHODS_V1.map(k => <option key={k} value={k}>{METHODS[k]}</option>)}
              </select>
            </label>
          )}
          {err && <p class="err-line" role="alert">{err}</p>}
          <p class="hint" style="margin:8px 0 0">Можно «1,25», «125 см» или «1250 мм». Enter — сохранить.</p>
          <div class="row" style="margin-top:10px;justify-content:flex-end">
            <button type="button" class="ghost" onClick={close}>Отмена</button>
            <button type="submit" class="primary">Сохранить</button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/** Отметка у поля в карточке: «✓ замерено» или «условно»; щелчок — окно замера */
export function StatusChip({ status, mref }: { status: DimStatus; mref: MeasureRef }) {
  const open = (e: Event) => { e.preventDefault(); e.stopPropagation(); openMeasure(mref); };
  return (
    <span
      class={'chip' + (status === 'measured' ? ' ok' : '')}
      role="button"
      tabIndex={0}
      title="Ввести замер"
      onClick={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') open(e); }}
    >
      {status === 'measured' ? '✓ замерено' : 'условно'}
    </span>
  );
}
