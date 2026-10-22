// Поля ввода боковой панели (как в прототипе: подпись над полем).
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Mm } from '../../model/types';
import { formatMeters, parseLength } from '../../model/units';
import { endGesture } from '../store';

/** Число из поля: запятая и точка — обе как десятичный разделитель */
export const parseNum = (t: string): number => parseFloat(String(t).replace(',', '.'));
const showNum = (v: number): string => String(v).replace('.', ',');

interface FieldProps {
  label: string;
  wide?: boolean;
  error?: string | null;
  children: ComponentChildren;
}

export function Field({ label, wide, error, children }: FieldProps) {
  return (
    <label class={'f' + (wide ? ' wide' : '') + (error ? ' bad' : '')}>
      {label && <span>{label}</span>}
      {children}
      {error && <span class="err" role="alert">{error}</span>}
    </label>
  );
}

interface TextProps {
  label: string;
  value: string;
  onValue: (v: string) => void;
  wide?: boolean;
  area?: boolean;
  placeholder?: string;
}

export function Text({ label, value, onValue, wide, area, placeholder }: TextProps) {
  return (
    <Field label={label} wide={wide}>
      {area
        ? <textarea value={value} onInput={e => onValue(e.currentTarget.value)} onBlur={endGesture} />
        : <input value={value} placeholder={placeholder} onInput={e => onValue(e.currentTarget.value)} onBlur={endGesture} />}
    </Field>
  );
}

interface LenProps {
  label: string;
  /** значение, мм */
  value: Mm;
  onValue: (mm: Mm) => void;
  wide?: boolean;
  /** только больше нуля (ширина, высота, длина) */
  positive?: boolean;
  /** применять при выходе из поля или по Enter, а не на каждую цифру */
  onCommit?: boolean;
}

/**
 * Поле длины: «1,25», «125 см», «1250 мм». Хранит свой текст, чтобы можно было набрать
 * «1,» без потери запятой; при ошибке — подсказка под полем, значение не меняется.
 */
export function Len({ label, value, onValue, wide, positive, onCommit }: LenProps) {
  const [text, setText] = useState(formatMeters(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const r = parseLength(text);
    if (!r.ok || r.mm !== value) { setText(formatMeters(value)); setError(null); }
  }, [value]);

  const check = (t: string): Mm | null => {
    const r = parseLength(t);
    if (!r.ok) { setError(r.error); return null; }
    if (positive && r.mm <= 0) { setError('Должно быть больше нуля'); return null; }
    setError(null);
    return r.mm;
  };
  const commit = () => {
    const mm = check(text);
    if (mm !== null) {
      // показать, как понято: «125 см» → «1,25»
      setText(formatMeters(mm));
      if (mm !== value) onValue(mm);
    }
    endGesture();
  };

  return (
    <Field label={label} wide={wide} error={error}>
      <input
        inputMode="decimal"
        value={text}
        aria-invalid={!!error}
        onInput={e => {
          const t = e.currentTarget.value;
          setText(t);
          const mm = check(t);
          if (!onCommit && mm !== null) onValue(mm);
        }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
      />
    </Field>
  );
}

interface NumProps {
  label: string;
  value: number;
  onValue: (v: number) => void;
  wide?: boolean;
}

/** Просто число (проценты и т. п.) */
export function Num({ label, value, onValue, wide }: NumProps) {
  const [text, setText] = useState(showNum(value));
  useEffect(() => {
    if (parseNum(text) !== value) setText(showNum(value));
  }, [value]);
  return (
    <Field label={label} wide={wide}>
      <input
        inputMode="decimal"
        value={text}
        onInput={e => {
          const t = e.currentTarget.value;
          setText(t);
          const v = parseNum(t);
          if (!isNaN(v)) onValue(v);
        }}
        onBlur={endGesture}
      />
    </Field>
  );
}

interface SelectProps<K extends string> {
  label: string;
  value: K;
  options: Record<K, string>;
  onValue: (v: K) => void;
  wide?: boolean;
}

export function Select<K extends string>({ label, value, options, onValue, wide }: SelectProps<K>) {
  return (
    <Field label={label} wide={wide}>
      <select value={value} onChange={e => onValue(e.currentTarget.value as K)}>
        {(Object.entries(options) as [K, string][]).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
    </Field>
  );
}

interface CheckProps {
  label: string;
  checked: boolean;
  onValue: (v: boolean) => void;
  style?: string;
}

export function Check({ label, checked, onValue, style }: CheckProps) {
  return (
    <label class="chk" style={style}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => {
          // галочка показывает состояние плана, а не щелчок: если действие отменили (не задали пароль) — не ставится
          const v = e.currentTarget.checked;
          e.currentTarget.checked = checked;
          onValue(v);
        }}
      />
      {label}
    </label>
  );
}
