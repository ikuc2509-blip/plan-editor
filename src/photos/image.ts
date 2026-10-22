// Уменьшенные копии для экрана и встроенная камера. Оригиналы здесь не меняются:
// копия рисуется отдельно, снимок камеры сохраняется как получен.

/** Уменьшенная копия для экрана (JPEG); null — браузер не умеет показать этот формат (например, HEIC) */
export async function makePreview(blob: Blob, max = 360): Promise<Blob | null> {
  try {
    // createImageBitmap сам учитывает поворот из EXIF
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.8));
  } catch {
    return null;
  }
}

/** ImageCapture (Chrome на Android): полноразмерный снимок с камеры; в типах браузера его нет */
interface ImageCaptureLike { takePhoto(): Promise<Blob> }
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureLike } | undefined;

/** Задняя камера телефона (на компьютере — какая есть), наибольшее разрешение */
export function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } },
  });
}

export function stopCamera(s: MediaStream | null): void {
  s?.getTracks().forEach(t => t.stop());
}

/** Снимок с камеры: полноразмерный через ImageCapture, иначе — кадр видео */
export async function capture(stream: MediaStream, video: HTMLVideoElement): Promise<Blob> {
  const track = stream.getVideoTracks()[0];
  if (track && typeof ImageCapture === 'function') {
    try { return await new ImageCapture(track).takePhoto(); } catch { /* ниже — кадр видео */ }
  }
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d')?.drawImage(video, 0, 0);
  const b = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.95));
  if (!b) throw new Error('Не удалось сделать снимок');
  return b;
}
