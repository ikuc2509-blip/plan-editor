// PDF A3 как в прототипе: лист растрируется в картинку 200 dpi.
// Векторный PDF (jsPDF + svg2pdf.js) — этап 2.

const DPI = 200;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось отрисовать лист для PDF'));
    img.src = src;
  });
}

export async function rasterPdf(svg: string): Promise<Blob> {
  // jsPDF грузится только при первом экспорте — из файлов самого приложения
  const { jsPDF } = await import('jspdf');
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  const W = Math.round(420 / 25.4 * DPI), H = Math.round(297 / 25.4 * DPI);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) throw new Error('Браузер не дал нарисовать лист');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  x.drawImage(img, 0, 0, W, H);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 420, 297);
  return pdf.output('blob');
}
