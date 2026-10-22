// Эталоны для тестов: запускает рисование листа из прототипа (prototype/plan-editor.html)
// без браузера и сохраняет пример аудитории и нарисованные прототипом листы в examples/.
// Запуск: node scripts/make-reference.mjs
// Перезапускать только если сознательно меняется эталон.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../prototype/plan-editor.html', import.meta.url), 'utf8');
const start = html.lastIndexOf('<script>') + '<script>'.length;
const end = html.indexOf("const svg=document.getElementById('sheet');");
if (start < 8 || end < 0) throw new Error('Не нашёл код прототипа');
let code = html.slice(start, end);

// Постоянные id вместо случайных, чтобы эталон не менялся от запуска к запуску
const uidSrc = 'const uid=()=>Math.random().toString(36).slice(2,9);';
if (!code.includes(uidSrc)) throw new Error('Не нашёл uid() в прототипе');
code = code.replace(uidSrc, "let __n=0;const uid=()=>'id'+String(++__n).padStart(3,'0');");

// sheetString() из раздела «Экспорт» прототипа — обёртка листа для файла SVG
const sheetStringSrc = html.slice(html.indexOf('function sheetString(){'), html.indexOf('let dl=null;'));

code += sheetStringSrc + `
__n=0;
const ex=example();
const clone=o=>JSON.parse(JSON.stringify(o));
const out={example:ex,sheets:{}};
state=clone(ex);out.sheets.schematic=sheetString();
state=clone(ex);state.room.mode='scale';state.room.scale=100;state.north='30';state.notes='Дополнительное примечание.\\nВторое примечание.';out.sheets.scale100=sheetString();
state=blank();out.sheets.blank=sheetString();
out;`;

// localStorage в Node нет — прототип сам перейдёт к example() (как в первом запуске)
const out = runInNewContext(code, {});

const dir = new URL('../examples/', import.meta.url);
mkdirSync(new URL('reference/', dir), { recursive: true });
writeFileSync(new URL('auditorium.prototype.json', dir), JSON.stringify(out.example, null, 1) + '\n');
for (const [name, svg] of Object.entries(out.sheets)) {
  writeFileSync(new URL(`reference/sheet-${name}.svg`, dir), svg);
}
console.log('Готово:', Object.keys(out.sheets).join(', '));
