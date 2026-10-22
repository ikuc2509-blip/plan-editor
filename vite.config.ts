import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Относительные пути: сайт работает с любого адреса GitHub Pages (имя репозитория не важно)
  base: './',
  // JSX для Preact без отдельного модуля-плагина
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: {
    alias: { react: 'preact/compat', 'react-dom': 'preact/compat' },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
