// Тесты интерфейса (этап 8): установленный Microsoft Edge, браузеры Playwright не скачиваются (decisions.md).
// «На месте» — в эмуляции телефона; файл осмотра потом открывается в «Чистовике» на компьютере.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5180;

/** окно «С чего начать» уже видели — в сценариях оно не мешает (само окно — e2e/start.spec.ts) */
const welcomed = { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'plan-editor:pref:welcomed', value: 'true' }] }] };

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // сценарии идут по порядку: второй открывает файл, сохранённый первым
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, channel: 'msedge', storageState: welcomed },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'phone', testMatch: /(onsite|wall|start)\.spec\.ts/,
      use: {
        ...devices['Pixel 7'], channel: 'msedge', storageState: welcomed,
        // поддельная камера браузера (заставка вместо видео) — для встроенной камеры, без вопроса о разрешении
        launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
        permissions: ['camera'],
      },
    },
    { name: 'desktop', testMatch: /editor\.spec\.ts/, use: { ...devices['Desktop Edge'], channel: 'msedge', storageState: welcomed }, dependencies: ['phone'] },
    // распознавание (этап 10): видеокарта через WebGPU и в браузере без окна
    { name: 'recognize', testMatch: /recognize\.spec\.ts/, use: { ...devices['Desktop Edge'], channel: 'msedge', storageState: welcomed, launchOptions: { args: ['--enable-unsafe-webgpu'] } } },
  ],
});
