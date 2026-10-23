// Тесты интерфейса (этап 8): установленный Microsoft Edge, браузеры Playwright не скачиваются (decisions.md).
// «На месте» — в эмуляции телефона; файл осмотра потом открывается в «Чистовике» на компьютере.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5180;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // сценарии идут по порядку: второй открывает файл, сохранённый первым
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, channel: 'msedge' },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'phone', testMatch: /onsite\.spec\.ts/, use: { ...devices['Pixel 7'], channel: 'msedge' } },
    { name: 'desktop', testMatch: /editor\.spec\.ts/, use: { ...devices['Desktop Edge'], channel: 'msedge' }, dependencies: ['phone'] },
  ],
});
