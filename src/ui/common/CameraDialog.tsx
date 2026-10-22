// Встроенная камера: снимок сразу в проект, в галерею телефона не попадает.
// Можно снять несколько кадров подряд; сверху — подсказка пункта списка съёмки.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ShotItem } from '../../photos/shots';
import { capture, openCamera, stopCamera } from '../../photos/image';
import { addCameraShot } from '../photos';

/** открыта камера: для какого пункта (null — просто снимок) */
const cameraFor = signal<{ shot: ShotItem | null } | null>(null);

export function openCameraDialog(shot: ShotItem | null = null): void {
  cameraFor.value = { shot };
}

export function CameraDialog() {
  const req = cameraFor.value;
  const dlg = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (!req) { if (d.open) d.close(); return; }
    setErr(null); setCount(0);
    if (!d.open) d.showModal();
    let alive = true;
    openCamera().then(s => {
      if (!alive) { stopCamera(s); return; }
      stream.current = s;
      if (video.current) { video.current.srcObject = s; void video.current.play(); }
    }, (e: unknown) => {
      const name = e instanceof DOMException ? e.name : '';
      setErr(name === 'NotAllowedError'
        ? 'Браузер не дал доступ к камере. Разрешите камеру для этого сайта (значок слева от адреса) и откройте снова.'
        : 'Камера недоступна. Добавьте снимки кнопкой «Из файлов».');
    });
    return () => { alive = false; stopCamera(stream.current); stream.current = null; };
  }, [req]);

  const close = () => { cameraFor.value = null; };
  const shoot = async () => {
    if (!stream.current || !video.current || busy) return;
    setBusy(true);
    try {
      await addCameraShot(await capture(stream.current, video.current), req?.shot ?? undefined);
      setCount(c => c + 1);
    } catch {
      setErr('Не удалось сделать снимок');
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dlg} class="camera" onCancel={e => { e.preventDefault(); close(); }}>
      {req && (
        <div class="cam-wrap">
          <div class="cam-top">
            <b>{req.shot ? req.shot.title : 'Снимок'}</b>
            {req.shot && <p>{req.shot.hint}</p>}
          </div>
          {err ? <p class="cam-err">{err}</p> : <video ref={video} playsInline muted />}
          <div class="cam-bar">
            <span>{count ? `Снято: ${count}` : 'Снимок сразу попадёт в проект, в галерею — нет'}</span>
            <button class="shoot" aria-label="Снять" disabled={!!err || busy} onClick={() => void shoot()} />
            <button onClick={close}>Готово</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
