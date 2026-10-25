// Номера слов (токены) для запросов модели OWLv2 — для разработчика, в приложение не входит.
// Запросы постоянные, поэтому словарь модели (1,5 МБ) в приложение не кладём: номера
// считаются один раз этим скриптом и вписываются в src/recognize/queries.ts.
// Запуск: node scripts/clip-tokens.mjs <папка с vocab.json и merges.txt> "a photo of a window" …
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, ...texts] = process.argv.slice(2);
const vocab = JSON.parse(readFileSync(join(dir, 'vocab.json'), 'utf8'));
const merges = readFileSync(join(dir, 'merges.txt'), 'utf8').split('\n').slice(1).filter(Boolean);
const rank = new Map(merges.map((m, i) => [m, i]));

// BPE как в токенизаторе CLIP: слово — буквы, у последней «</w>», склеивать пары по рангу
function bpe(word) {
  let parts = [...word.slice(0, -1)].concat(word.slice(-1) + '</w>');
  for (;;) {
    let best = -1, bi = -1;
    for (let i = 0; i < parts.length - 1; i++) {
      const r = rank.get(parts[i] + ' ' + parts[i + 1]);
      if (r !== undefined && (best < 0 || r < best)) { best = r; bi = i; }
    }
    if (bi < 0) return parts;
    parts = [...parts.slice(0, bi), parts[bi] + parts[bi + 1], ...parts.slice(bi + 2)];
  }
}

for (const t of texts) {
  // только латиница и пробелы — других запросов у нас нет
  if (!/^[a-z ]+$/.test(t)) throw new Error('Только строчная латиница: ' + t);
  const ids = [vocab['<|startoftext|>']];
  for (const w of t.split(/ +/)) for (const p of bpe(w)) {
    if (vocab[p] === undefined) throw new Error('Нет в словаре: ' + p);
    ids.push(vocab[p]);
  }
  ids.push(vocab['<|endoftext|>']);
  console.log(JSON.stringify(t), JSON.stringify(ids));
}
