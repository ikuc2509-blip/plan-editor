// Чтение компаса телефона (этап 11): полторы секунды показаний, среднее направление.
// Датчик — в самом телефоне, сеть не нужна.
import { headingOf, isFlat, meanAngle, type OrientationSample } from '../../geometry/compass';

/** Есть ли в браузере датчик ориентации (на компьютере обычно нет) */
export const compassSupported = (): boolean =>
  typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && navigator.maxTouchPoints > 0;

type Ev = DeviceOrientationEvent & { webkitCompassHeading?: number };

/** Направление верхнего края телефона, градусы по часовой от севера */
export async function readHeading(ms = 1500): Promise<number> {
  // iPhone (и новые Chrome) спрашивают разрешение — только по нажатию кнопки; отказ проверяем по показаниям
  const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
  const perm = req ? await req.call(DeviceOrientationEvent).catch(() => 'denied') : 'granted';
  // Android отдаёт показания относительно севера отдельным событием
  const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  const all: number[] = [], flat: number[] = [];
  const on = (e: Event) => {
    const ev = e as Ev;
    // обычное событие без webkitCompassHeading — направление от случайного нуля, не от севера
    if (type === 'deviceorientation' && typeof ev.webkitCompassHeading !== 'number' && !ev.absolute) return;
    const s: OrientationSample = { alpha: ev.alpha, beta: ev.beta, gamma: ev.gamma, webkitCompassHeading: ev.webkitCompassHeading };
    const h = headingOf(s);
    if (h === null) return;
    all.push(h);
    if (isFlat(s)) flat.push(h);
  };
  window.addEventListener(type, on);
  await new Promise(r => setTimeout(r, ms));
  window.removeEventListener(type, on);
  if (!all.length) {
    throw new Error(perm === 'granted'
      ? 'Компас на этом телефоне недоступен — впишите градусы вручную'
      : 'Нет разрешения на компас — разрешите датчики движения для сайта в настройках браузера');
  }
  if (!flat.length) throw new Error('Держите телефон ровно, экраном вверх, и нажмите ещё раз');
  return meanAngle(flat)!;
}
