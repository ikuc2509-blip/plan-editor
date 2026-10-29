// Фототаблица в PDF (A4): шапка ведомства, «к протоколу осмотра…», снимки с подписями, строка подписи.
// В PDF идут уменьшенные копии снимков; оригиналы не меняются и лежат в файле .omp (CLAUDE.md, правило 7).
import type { Photo, Plan } from '../model/types';
import { CAP_LINE, PAGE, arrowGeom, isSmall, layoutPhototable, photoCaption, phototableOrder, signer, type TableBox } from '../photos/phototable';
import { FONT_NAME } from '../render/svg';
import { loadFonts } from './font';

/** длинная сторона копии в PDF, пикселей: для печати снимка 15 см с запасом */
const MAX_PX = 1800;
const LINE = '______________________';

interface Prepared { ph: Photo; jpeg: Uint8Array | null; w: number; h: number }

/** Уменьшенная копия JPEG; поворот из EXIF браузер учитывает сам */
async function prepare(ph: Photo, blob: Blob | null): Promise<Prepared> {
  if (!blob) return { ph, jpeg: null, w: 0, h: 0 };
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const out = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.85));
    return { ph, jpeg: out && new Uint8Array(await out.arrayBuffer()), w: c.width, h: c.height };
  } catch {
    // формат, который браузер не показывает (например, HEIC)
    return { ph, jpeg: null, w: 0, h: 0 };
  }
}

const today = (): string => new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

export async function phototablePdf(plan: Plan, load: (id: string) => Promise<Blob | null>): Promise<Blob> {
  const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), loadFonts()]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('PTSans-Regular.ttf', fonts.regular);
  doc.addFont('PTSans-Regular.ttf', FONT_NAME, 'normal');
  doc.addFileToVFS('PTSans-Bold.ttf', fonts.bold);
  doc.addFont('PTSans-Bold.ttf', FONT_NAME, 'bold');
  doc.setProperties({ title: 'Фототаблица', subject: plan.stamp.object, creator: 'Редактор плана места происшествия' });
  const font = (size: number, bold = false) => { doc.setFont(FONT_NAME, bold ? 'bold' : 'normal'); doc.setFontSize(size); };
  const width = PAGE.right - PAGE.left, mid = PAGE.left + width / 2;

  // шапка первого листа
  const head = plan.phototable;
  let y = PAGE.top;
  font(12, true);
  for (const line of head.org.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3)) {
    doc.text(line, mid, y, { align: 'center' });
    y += 5.5;
  }
  font(9);
  y += 1;
  if (head.orgAddress.trim()) doc.text(head.orgAddress.trim(), PAGE.left, y);
  doc.text(`Дата изготовления: ${today()}`, PAGE.right, y, { align: 'right' });
  y += 8;
  font(11);
  const st = plan.stamp;
  const to = `к протоколу осмотра места происшествия от ${st.date.trim() || '«___» ____________ 20___ г.'} по адресу: ${st.object.trim() || LINE + LINE}, КУСП № ${head.kusp.trim() || '________'}.`;
  for (const line of doc.splitTextToSize(to, width) as string[]) {
    doc.text(line, PAGE.left, y);
    y += 5;
  }
  y += 5;
  font(14, true);
  doc.text('ФОТОТАБЛИЦА', mid, y, { align: 'center' });
  y += 8;

  // снимки
  const photos = phototableOrder(plan.photos);
  const ready = await Promise.all(photos.map(async ph => prepare(ph, ph.file ? await load(ph.id) : null)));
  const boxes: TableBox[] = ready.map(r => ({
    id: r.ph.id, w: r.w, h: r.h, small: !!r.jpeg && isSmall(r.w, r.h, r.ph.kind), caption: photoCaption(plan, r.ph),
  }));
  font(11, true);
  const pages = layoutPhototable(boxes, y, (t, w) => doc.splitTextToSize(t, w) as string[]);
  const byId = new Map(ready.map(r => [r.ph.id, r]));
  const { role, name } = signer(st.author);

  /** стрелки с номерами меток поверх снимка: красные, номер в белом кружке, как метки на плане */
  const drawArrows = (ph: Photo, s: { x: number; y: number; w: number; h: number }) => {
    for (const a of ph.arrows) {
      const m = plan.markers.find(k => k.id === a.markerId);
      if (!m) continue;
      const g = arrowGeom(a, s.w, s.h), X = (v: number) => s.x + v, Y = (v: number) => s.y + v;
      doc.setDrawColor(208, 51, 43);
      doc.setFillColor(208, 51, 43);
      doc.setLineWidth(Math.max(0.5, g.r * 0.28));
      doc.line(X(g.from.x), Y(g.from.y), X(g.base.x), Y(g.base.y));
      const [t, l, rr] = g.head;
      doc.triangle(X(t!.x), Y(t!.y), X(l!.x), Y(l!.y), X(rr!.x), Y(rr!.y), 'F');
      doc.setFillColor(255, 255, 255);
      doc.setLineWidth(Math.max(0.4, g.r * 0.18));
      doc.circle(X(g.tail.x), Y(g.tail.y), g.r, 'FD');
      doc.setTextColor(208, 51, 43);
      font(Math.max(6, (g.r * 1.15) / 0.3528), true);
      doc.text(m.n, X(g.tail.x), Y(g.tail.y) + g.r * 0.36, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
  };

  pages.forEach((slots, i) => {
    if (i > 0) doc.addPage();
    // номер листа сверху, строка подписи снизу — на каждом листе
    font(9);
    doc.text(String(i + 1), mid, 12, { align: 'center' });
    font(11);
    doc.text(`${role || 'Составил'}   ${LINE}   ${name || LINE}`, PAGE.left, PAGE.h - 14);
    for (const s of slots) {
      const r = byId.get(s.id)!;
      if (r.jpeg) {
        doc.addImage(r.jpeg, 'JPEG', s.x, s.y, s.w, s.h, undefined, 'FAST');
        drawArrows(r.ph, s);
      }
      else {
        doc.setDrawColor(150);
        doc.rect(s.x, s.y, s.w, s.h);
        font(10);
        const why = r.ph.file ? 'браузер не может показать этот формат снимка' : 'файл снимка не найден';
        doc.text([`Снимок № ${r.ph.n}: ${why}.`, 'Вставьте его в распечатку вручную.'], s.x + s.w / 2, s.y + s.h / 2, { align: 'center' });
      }
      font(11, true);
      s.lines.forEach((line, k) => doc.text(line, s.capX, s.capY + k * CAP_LINE, { align: 'center' }));
    }
  });
  return doc.output('blob');
}
