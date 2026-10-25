import { defineConfig } from 'vitest/config';
import pkg from './package.json';
import { pwaPlugin } from './src/pwa/plugin';

export default defineConfig({
  // Относительные пути: сайт работает с любого адреса GitHub Pages (имя репозитория не важно)
  base: './',
  // версия приложения записывается в manifest.json файла проекта
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // JSX для Preact без отдельного модуля-плагина
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  // работа без сети и CSP — только в собранном приложении
  plugins: [pwaPlugin(pkg.version)],
  resolve: {
    alias: { react: 'preact/compat', 'react-dom': 'preact/compat' },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  // фоновый поток распознавания — модуль: движок модели написан как ES-модуль
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
