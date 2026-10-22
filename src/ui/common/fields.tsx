// Поля ввода боковой панели (как в прототипе: подпись над полем).
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/** Число из поля: запятая и точка — обе как десятичный разделитель */
export const parseNum = (t: string): number => parseFloat(String(t).replace(',', '.'));
const showNum = (v: number): string => String(v).replace('.', ',');

interface FieldProps {
  label: string;
  wide?: boolean;
  children: ComponentChildren;
}

export function Field({ label, wide, children }: FieldProps) {
  return (
    <label class={'f' + (wide ? ' wide' : '')}>
      {label && <span>{label}</span>}
      {children}
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
        ? <textarea value={value} onInput={e => onValue(e.currentTarget.value)} />
        : <input value={value} placeholder={placeholder} onInput={e => onValue(e.currentTarget.value)} />}
    </Field>
  );
}

interface NumProps {
  label: string;
  value: number;
  onValue: (v: number) => void;
  wide?: boolean;
}

/** Числовое поле: свой текст, чтобы можно было набрать «1,» без потери запятой */
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
      <input type="checkbox" checked={checked} onChange={e => onValue(e.currentTarget.checked)} />
      {label}
    </label>
  );
}
