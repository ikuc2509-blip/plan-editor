// Окно ввода пароля: задать новый (дважды) или ввести для открытия файла.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';

export const PASSWORD_WARNING = 'Забытый пароль не восстановит никто — ни вы, ни разработчик. Без пароля файл не откроется.';

interface Ask {
  mode: 'set' | 'enter';
  title: string;
  error?: string;
  resolve: (pw: string | null) => void;
}

const current = signal<Ask | null>(null);

/** Спросить пароль; null — пользователь отказался */
export function askPassword(mode: Ask['mode'], title: string, error?: string): Promise<string | null> {
  return new Promise(resolve => { current.value = { mode, title, ...(error ? { error } : {}), resolve }; });
}

export function PasswordDialog() {
  const ask = current.value;
  const ref = useRef<HTMLDialogElement>(null);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ask) {
      setA(''); setB(''); setErr(ask.error ?? null);
      if (!d.open) d.showModal();
      // браузер при открытии окна ставит фокус на само окно — переносим в поле пароля чуть позже
      setTimeout(() => d.querySelector('input')?.focus(), 30);
    } else if (d.open) d.close();
  }, [ask]);

  const finish = (pw: string | null) => { const r = ask?.resolve; current.value = null; r?.(pw); };
  const submit = (e: Event) => {
    e.preventDefault();
    if (!a) { setErr('Введите пароль'); return; }
    if (ask?.mode === 'set') {
      if (a.length < 6) { setErr('Пароль — не короче 6 символов'); return; }
      if (a !== b) { setErr('Пароли не совпадают'); return; }
    }
    finish(a);
  };

  return (
    <dialog ref={ref} class="pw" onCancel={e => { e.preventDefault(); finish(null); }}>
      {ask && (
        <form onSubmit={submit}>
          <h3>{ask.title}</h3>
          {ask.mode === 'set' && <p class="warn">{PASSWORD_WARNING}</p>}
          <label class="f wide"><span>Пароль</span>
            <input type="password" autoComplete={ask.mode === 'set' ? 'new-password' : 'current-password'} value={a} onInput={e => setA(e.currentTarget.value)} />
          </label>
          {ask.mode === 'set' && (
            <label class="f wide" style="margin-top:6px"><span>Ещё раз</span>
              <input type="password" autoComplete="new-password" value={b} onInput={e => setB(e.currentTarget.value)} />
            </label>
          )}
          {err && <p class="err-line" role="alert">{err}</p>}
          <div class="row" style="margin-top:10px;justify-content:flex-end">
            <button type="button" class="ghost" onClick={() => finish(null)}>Отмена</button>
            <button type="submit" class="primary">{ask.mode === 'set' ? 'Задать пароль' : 'Открыть'}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
