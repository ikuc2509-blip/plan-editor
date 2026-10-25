// Пакет распознавания для сайта: public/pack/<id>/<файл>.000, .001 … (decisions.md, этап 10).
// Запускается при публикации (GitHub Actions) и у разработчика; в git пакет не попадает.
// Модель качается с Hugging Face по закреплённой версии, движок берётся из node_modules.
// Всё сверяется с отпечатками из src/recognize/packInfo.ts — не совпало, публикации не будет.
//   node scripts/pack.mjs            — собрать пакет
//   node scripts/pack.mjs --print    — посчитать отпечатки кусков (при смене модели или движка)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK, PART_SIZE, partPath } from '../src/recognize/packInfo.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.pack-cache');
const print = process.argv.includes('--print');
const sha = buf => createHash('sha256').update(buf).digest('hex');

async function source(f) {
  if (f.key === 'wasm') return readFileSync(join(root, 'node_modules/onnxruntime-web/dist', f.name));
  const local = join(cache, f.name);
  if (!existsSync(local)) {
    console.log('Скачиваю модель:', PACK.source);
    const r = await fetch(PACK.source);
    if (!r.ok) throw new Error('Модель не скачана: ' + r.status);
    mkdirSync(cache, { recursive: true });
    writeFileSync(local, Buffer.from(await r.arrayBuffer()));
  }
  return readFileSync(local);
}

const out = join(root, 'public/pack');
rmSync(out, { recursive: true, force: true });
for (const f of PACK.files) {
  const buf = await source(f);
  if (buf.length !== f.size || sha(buf) !== f.sha256) throw new Error(`Не совпал отпечаток ${f.name} — файл испорчен или подменён`);
  const parts = [];
  for (let i = 0; i * PART_SIZE < buf.length; i++) {
    const part = buf.subarray(i * PART_SIZE, (i + 1) * PART_SIZE);
    parts.push(sha(part));
    if (print) continue;
    if (parts[i] !== f.parts[i]) throw new Error(`Не совпал отпечаток куска ${i} файла ${f.name}`);
    const path = join(root, 'public', partPath(f, i));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, part);
  }
  if (print) console.log(f.name, JSON.stringify(parts, null, 2));
  else if (parts.length !== f.parts.length) throw new Error(`Не то число кусков у ${f.name}`);
  else console.log(`${f.name}: кусков — ${parts.length}, отпечатки совпали`);
}
