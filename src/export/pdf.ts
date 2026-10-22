// Векторный PDF: та же SVG-картинка листа, что на экране, переведённая в PDF.
// Текст остаётся текстом (ищется поиском), линии чёткие при любом увеличении.
import type { Plan } from '../model/types';
import { sheetLayout, sheetSvg } from '../render/sheet';
import { FONT_NAME } from '../render/svg';
import { loadFonts } from './font';

export async function vectorPdf(plan: Plan): Promise<Blob> {
  // библиотеки грузятся только при первом экспорте — из файлов самого приложения
  const [{ jsPDF }, { svg2pdf }, fonts] = await Promise.all([import('jspdf'), import('svg2pdf.js'), loadFonts()]);
  const lay = sheetLayout(plan);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: lay.paper === 'A4' ? 'a4' : 'a3', compress: true });
  doc.addFileToVFS('PTSans-Regular.ttf', fonts.regular);
  doc.addFont('PTSans-Regular.ttf', FONT_NAME, 'normal');
  doc.addFileToVFS('PTSans-Bold.ttf', fonts.bold);
  doc.addFont('PTSans-Bold.ttf', FONT_NAME, 'bold');
  doc.setFont(FONT_NAME, 'normal');
  doc.setProperties({
    title: plan.stamp.name || 'План-схема места происшествия',
    subject: [plan.stamp.object, plan.stamp.protocol].filter(Boolean).join(' — '),
    creator: 'Редактор плана места происшествия',
  });
  const svg = new DOMParser().parseFromString(sheetSvg(plan), 'image/svg+xml').documentElement;
  await svg2pdf(svg, doc, { x: 0, y: 0, width: lay.w, height: lay.h });
  return doc.output('blob');
}
