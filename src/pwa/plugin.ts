// Дополнение к сборке: service worker, список файлов версии и правило CSP.
// Работает только при `npm run build`; на сервере разработки ничего этого нет.
import type { Plugin } from 'vite';
import { LIST_FILE, makeAppFiles } from './precache';

/**
 * Content-Security-Policy: загружать можно только с адреса самого приложения (тайна
 * следствия, ст. 161 УПК РФ). data: и blob: — данные внутри браузера, не сеть.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // атрибуты style= в листе и интерфейсе
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export function pwaPlugin(version: string): Plugin {
  return {
    name: 'omp-pwa',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      // отдельный файл в корне сайта: помощник обслуживает только адреса не выше себя
      this.emitFile({ type: 'chunk', id: '/src/pwa/sw.ts', fileName: 'sw.js' });
    },
    transformIndexHtml: {
      order: 'post',
      // сразу после кодировки, до любых скриптов
      handler: html => {
        const charset = '<meta charset="utf-8">';
        if (!html.includes(charset)) throw new Error('В index.html нет ' + charset);
        return html.replace(charset, `${charset}\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
      },
    },
    generateBundle(_opts, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') return this.error('В сборке нет index.html');
      const list = makeAppFiles(version, Object.keys(bundle), String(index.source));
      this.emitFile({ type: 'asset', fileName: LIST_FILE, source: JSON.stringify(list, null, 1) });
    },
  };
}
