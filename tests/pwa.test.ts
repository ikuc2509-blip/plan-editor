import { describe, expect, it } from 'vitest';
import { PUBLIC_FILES, cacheKeyFor, cacheName, fingerprint, makeAppFiles, staleCaches } from '../src/pwa/precache';
import { CSP } from '../src/pwa/plugin';

const BUNDLE = ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'assets/PTSans-Regular-x.ttf', 'sw.js', 'assets/index-abc.js.map'];

describe('список файлов версии', () => {
  it('берёт файлы сборки и public/, без помощника и карт исходников', () => {
    const l = makeAppFiles('0.4.0', BUNDLE, '<html>1</html>');
    expect(l.files).toContain('index.html');
    expect(l.files).toContain('assets/PTSans-Regular-x.ttf');
    for (const f of PUBLIC_FILES) expect(l.files).toContain(f);
    expect(l.files).not.toContain('sw.js');
    expect(l.files.some(f => f.endsWith('.map'))).toBe(false);
    expect(l.version).toBe('0.4.0');
  });

  it('отпечаток сборки меняется при изменении страницы или файлов, а не от порядка', () => {
    const a = makeAppFiles('0.4.0', BUNDLE, '<html>1</html>');
    expect(makeAppFiles('0.4.0', [...BUNDLE].reverse(), '<html>1</html>').build).toBe(a.build);
    expect(makeAppFiles('0.4.0', BUNDLE, '<html>2</html>').build).not.toBe(a.build);
    expect(makeAppFiles('0.4.0', [...BUNDLE, 'assets/new.js'], '<html>1</html>').build).not.toBe(a.build);
    expect(makeAppFiles('0.4.1', BUNDLE, '<html>1</html>').build).not.toBe(a.build);
  });

  it('отпечаток строки стабилен', () => {
    expect(fingerprint('')).toBe('811c9dc5');
    expect(fingerprint('План')).toBe(fingerprint('План'));
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
  });

  it('файлы из списка public/ действительно лежат в public/', () => {
    const real = Object.keys(import.meta.glob('/public/**/*')).map(p => p.replace('/public/', ''));
    for (const f of PUBLIC_FILES) expect(real).toContain(f);
  });
});

describe('что отдаёт помощник без сети', () => {
  const files = ['index.html', 'assets/a.js', 'icons/icon.svg'];
  it('открытие страницы — index.html', () => {
    expect(cacheKeyFor('', true, files)).toBe('index.html');
    expect(cacheKeyFor('', false, files)).toBe('index.html');
    expect(cacheKeyFor('что-угодно', true, files)).toBe('index.html');
  });
  it('файл версии — из хранилища, чужой — в сеть', () => {
    expect(cacheKeyFor('assets/a.js', false, files)).toBe('assets/a.js');
    expect(cacheKeyFor('assets/b.js', false, files)).toBeNull();
    expect(cacheKeyFor('app-files.json', false, files)).toBeNull();
  });
  it('удаляются только старые версии приложения', () => {
    const names = [cacheName('aaa'), cacheName('bbb'), cacheName('ccc'), 'omp-state', 'чужое'];
    expect(staleCaches(names, ['aaa', null])).toEqual([cacheName('bbb'), cacheName('ccc')]);
    expect(staleCaches(names, ['aaa', 'ccc'])).toEqual([cacheName('bbb')]);
  });
});

describe('CSP', () => {
  it('разрешает только адрес приложения и данные внутри браузера', () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).not.toMatch(/https?:|\*|'unsafe-eval'/);
    const sources = CSP.split(';').flatMap(d => d.trim().split(/\s+/).slice(1));
    for (const s of sources) expect(["'self'", "'none'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'data:', 'blob:']).toContain(s);
  });
  it('скрипты — только свои, без вставок в страницу', () => {
    expect(CSP).toContain("script-src 'self' 'wasm-unsafe-eval'");
    // eval для JavaScript по-прежнему запрещён; WebAssembly — только движок распознавания
    expect(CSP.split(';').find(d => d.trim().startsWith('script-src'))).not.toContain('unsafe-inline');
    expect(CSP).toContain("object-src 'none'");
  });
});
