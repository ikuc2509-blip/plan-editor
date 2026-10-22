// Файл проекта .omp: сохранить → открыть, старые версии, пароль, совместимость с архиватором.
import { describe, expect, test } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { readManifest, readOmp, writeOmp, type OmpContent } from '../src/storage/omp';
import { isoDate, objectSlug, projectFileName } from '../src/storage/naming';
import { example } from '../src/model/state';
import { FORMAT_VERSION } from '../src/model/types';
import v1file from '../examples/old/auditorium.v1.json';

const meta = { created: '2026-10-22T09:00:00.000Z', modified: '2026-10-22T11:30:00.000Z', saveNumber: 3 };
// «снимок» — произвольные байты, как у настоящего JPEG
const photo = Uint8Array.from({ length: 5000 }, (_, i) => (i * 37 + 11) % 256);
const content = (): OmpContent => ({ plan: example(), meta, photos: { '001.jpg': photo } });

describe('без пароля', () => {
  test('сохранить → открыть: тот же проект', async () => {
    const r = await readOmp(await writeOmp(content()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content.plan).toEqual(example());
    expect(r.content.meta).toEqual(meta);
    expect(r.encrypted).toBe(false);
  });

  test('байты снимка не меняются', async () => {
    const r = await readOmp(await writeOmp(content()));
    expect(r.ok && r.content.photos['001.jpg']).toEqual(photo);
  });

  test('обычный ZIP: архиватор видит manifest.json, plan.json, photos/', async () => {
    const files = unzipSync(await writeOmp(content()));
    expect(Object.keys(files).sort()).toEqual(['manifest.json', 'photos/001.jpg', 'plan.json']);
    const m = JSON.parse(strFromU8(files['manifest.json']!));
    expect(m).toMatchObject({ format: 'plan-editor-omp', version: 1, plan: FORMAT_VERSION, saveNumber: 3, created: meta.created, modified: meta.modified });
    expect(typeof m.app).toBe('string');
    expect(JSON.parse(strFromU8(files['plan.json']!)).stamp.object).toBe('Аудитория, ул. Широкая, 33');
  });
});

describe('с паролем', () => {
  test('верный пароль открывает', async () => {
    const bytes = await writeOmp(content(), 'секрет-123');
    const r = await readOmp(bytes, 'секрет-123');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.encrypted).toBe(true);
    expect(r.content.plan).toEqual(example());
    expect(r.content.photos['001.jpg']).toEqual(photo);
  });

  test('неверный пароль — понятная ошибка', async () => {
    const r = await readOmp(await writeOmp(content(), 'секрет-123'), 'секрет-124');
    expect(r).toEqual({ ok: false, reason: 'wrong-password', error: 'Неверный пароль' });
  });

  test('без пароля — просьба ввести пароль', async () => {
    const r = await readOmp(await writeOmp(content(), 'секрет-123'));
    expect(r.ok === false && r.reason).toBe('need-password');
  });

  test('снаружи ZIP: открыт только manifest.json, в нём нет адреса', async () => {
    const bytes = await writeOmp(content(), 'секрет-123');
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(['content.bin', 'manifest.json']);
    const m = readManifest(bytes)!;
    expect(m.encrypted).toMatchObject({ alg: 'AES-GCM', kdf: 'PBKDF2-SHA-256', file: 'content.bin' });
    const asText = new TextDecoder('latin1').decode(bytes) + strFromU8(files['manifest.json']!);
    expect(asText).not.toContain('Широкая');
    expect(asText).not.toContain(new TextDecoder('latin1').decode(strToU8('Широкая')));
  });

  test('каждое сохранение шифруется по-новому (новая «соль»)', async () => {
    const a = readManifest(await writeOmp(content(), 'п'))!, b = readManifest(await writeOmp(content(), 'п'))!;
    expect(a.encrypted!.salt).not.toBe(b.encrypted!.salt);
  });
});

describe('старые и чужие файлы', () => {
  test('.omp с планом версии 1 внутри открывается и переводится', async () => {
    const bytes = zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'plan-editor-omp', version: 1, app: '0.1.0', plan: 1, ...meta })),
      'plan.json': strToU8(JSON.stringify(v1file)),
    });
    const r = await readOmp(bytes);
    expect(r.ok && r.migratedFrom).toBe('v1');
    expect(r.ok && r.content.plan.sheet.paper).toBe('A3');
  });

  test('файл более новой версии — просьба обновить приложение', async () => {
    const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'plan-editor-omp', version: 99, ...meta })) });
    const r = await readOmp(bytes);
    expect(r.ok === false && r.error).toMatch(/более новой версией/);
  });

  test.each<[string, Uint8Array]>([
    ['не ZIP', strToU8('просто текст')],
    ['ZIP без manifest.json', zipSync({ 'a.txt': strToU8('a') })],
    ['ZIP без плана', zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'plan-editor-omp', version: 1, ...meta })) })],
  ])('%s — ошибка без падения', async (_, bytes) => {
    const r = await readOmp(bytes);
    expect(r.ok).toBe(false);
  });
});

describe('имя файла', () => {
  test('как в decisions.md', () => {
    expect(projectFileName(example(), 3, false)).toBe('ОМП_2026-10-22_Широкая-33_03.omp');
  });

  test('с паролем — без объекта', () => {
    expect(projectFileName(example(), 3, true)).toBe('ОМП_2026-10-22_03.omp');
  });

  test('без даты в штампе — сегодняшняя', () => {
    const p = example();
    p.stamp.date = '';
    expect(projectFileName(p, 12, false, new Date(2026, 0, 5))).toBe('ОМП_2026-01-05_Широкая-33_12.omp');
  });

  test.each<[string, string]>([
    ['Аудитория, ул. Широкая, 33', 'Широкая-33'],
    // «/» в имени файла Windows не допускает
    ['Квартира, просп. Мира, д. 15/2', 'Мира-15-2'],
    ['Склад у реки', 'Склад-у-реки'],
    ['', ''],
  ])('объект «%s» → «%s»', (object, slug) => {
    expect(objectSlug(object)).toBe(slug);
  });

  test('дата из штампа', () => {
    expect(isoDate('1.2.2026')).toBe('2026-02-01');
  });
});
