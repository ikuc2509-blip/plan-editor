import { useEffect, useState } from 'preact/hooks';
import { toastMsg } from '../store';

export function Toast() {
  const msg = toastMsg.value;
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!msg) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 2600);
    return () => clearTimeout(t);
  }, [msg?.n]);
  return <div id="toast" class={on ? 'on' : ''} role="status">{msg?.text ?? ''}</div>;
}
