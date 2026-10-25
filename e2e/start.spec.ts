// Этап 11 на телефоне: первый запуск — «С чего начать», свёрнутый план, север, экран не гаснет.
import { expect, test } from '@playwright/test';

test.describe('первый запуск', () => {
  // чистый браузер: окно ещё не видели
  test.use({ storageState: { cookies: [], origins: [] } });

  test('окно «С чего начать»: новый осмотр вместо примера; второй раз само не появляется', async ({ page }) => {
    await page.goto('/');
    const dlg = page.locator('dialog.welcome[open]');
    await expect(dlg.getByRole('heading', { name: 'С чего начать' })).toBeVisible();
    await expect(dlg).toContainText('учебный пример');
    await dlg.getByRole('button', { name: 'Начать новый осмотр' }).click();
    await expect(dlg).toHaveCount(0);
    // пример заменён пустым планом с сегодняшней датой
    await expect(page.getByLabel('Адрес, помещение')).toHaveValue('');
    await expect(page.getByLabel('Дата')).toHaveValue(/^\d\d\.\d\d\.\d{4}$/);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'На месте' })).toBeVisible();
    await expect(page.locator('dialog.welcome[open]')).toHaveCount(0);
    // открыть снова — кнопкой; без примера на экране — «Закрыть»
    await page.getByRole('button', { name: 'С чего начать' }).click();
    await expect(dlg).not.toContainText('учебный пример');
    await dlg.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dlg).toHaveCount(0);
  });

  test('«Посмотреть пример» оставляет учебную аудиторию', async ({ page }) => {
    await page.goto('/');
    await page.locator('dialog.welcome[open]').getByRole('button', { name: 'Посмотреть пример' }).click();
    await expect(page.getByLabel('Адрес, помещение')).toHaveValue(/Широкая, 33/);
  });
});

test('план свёрнут на шагах «Фото», «Замеры», «Итог»; на «Метках» — виден', async ({ page }) => {
  await page.goto('/');
  const nav = (name: string) => page.getByRole('navigation', { name: 'Шаги осмотра' }).getByRole('button', { name });
  const sheet = page.getByTestId('sheet');
  for (const s of ['Фото', 'Замеры', 'Итог']) {
    await nav(s).click();
    await expect(sheet).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Показать план' }).click();
  await expect(sheet).toBeVisible();
  await page.getByRole('button', { name: 'Скрыть' }).click();
  await expect(sheet).toHaveCount(0);
  await nav('Метки').click();
  await expect(sheet).toBeVisible();
});

test('север по компасу: телефон верхним краем к стене А на востоке → север слева на листе', async ({ page }) => {
  // поддельный компас Android: alpha 270 — верхний край телефона смотрит на восток
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ondeviceorientationabsolute', { value: null, writable: true });
    const orig = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, fn: EventListener, o?: unknown) => {
      if (type === 'deviceorientationabsolute') {
        const t = setInterval(() => fn(Object.assign(new Event(type), { alpha: 270, beta: 3, gamma: -2, absolute: true })), 100);
        setTimeout(() => clearInterval(t), 1000);
        return;
      }
      return orig(type, fn, o as AddEventListenerOptions);
    }) as typeof window.addEventListener;
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Шаги осмотра' }).getByRole('button', { name: 'Помещение' }).click();
  await page.getByRole('button', { name: 'По компасу' }).click();
  await expect(page.locator('#toast')).toContainText('Север: 270°', { timeout: 5000 });
  await expect(page.getByLabel('Север, градусы')).toHaveValue('270');
});

test('кнопка «экран не гаснет» в шапке, по умолчанию включена', async ({ page }) => {
  await page.goto('/');
  const b = page.getByRole('button', { name: 'Экран не гаснет' });
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  await b.click();
  await expect(b).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#toast')).toContainText('Экран гаснет как обычно');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Экран не гаснет' })).toHaveAttribute('aria-pressed', 'false');
});
