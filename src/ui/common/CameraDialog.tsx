// Встроенная камера: снимок сразу в проект, в галерею телефона не попадает.
// Можно снять несколько кадров подряд; сверху — подсказка пункта списка съёмки.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ShotItem } from '../../photos/shots';
import { capture, openCamera, stopCamera } from '../../photos/image';
import { addCameraShot, selPhoto } from '../photos';
import { openRectify } from '../rectify';

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
  // кнопка «Снять» — только когда камера уже показывает картинку
  const [ready, setReady] = useState(false);
  // режим «Снять стену …» (этап 9): рамка-подсказка, после снимка — сразу «Выпрямить»
  const wallShot = req?.shot?.link.kind === 'wall' ? req.shot.link.wallId : null;
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (!req) { if (d.open) d.close(); return; }
    setErr(null); setCount(0); setLast(null); setReady(false);
    if (!d.open) d.showModal();
    let alive = true;
    openCamera().then(s => {
      if (!alive) { stopCamera(s); return; }
      stream.current = s;
      if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => undefined).finally(() => { if (alive) setReady(true); }); }
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
      setLast(selPhoto.value);
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
          {err ? <p class="cam-err">{err}</p> : (
            <div class="cam-view">
              <video ref={video} playsInline muted />
              {wallShot && (
                <div class="cam-guide" aria-hidden="true">
                  <span class="g-top">потолок</span><span class="g-bot">пол</span><i class="g-mid" />
                </div>
              )}
            </div>
          )}
          <div class="cam-bar">
            <span>{count ? `Снято: ${count}` : 'Снимок сразу попадёт в проект, в галерею — нет'}</span>
            <button class="shoot" aria-label="Снять" disabled={!!err || busy || !ready} onClick={() => void shoot()} />
            {wallShot && last
              ? <button onClick={() => { const id = last; close(); openRectify(id, { wallId: wallShot }); }}>Выпрямить</button>
              : <button onClick={close}>Готово</button>}
          </div>
        </div>
      )}
    </dialog>
  );
}
