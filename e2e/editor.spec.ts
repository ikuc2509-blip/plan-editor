// Сценарий «Чистовик» на компьютере: файл осмотра с телефона открывается со всеми данными.
import { expect, test } from '@playwright/test';
import { OMP_PATH } from './paths';

test('файл с телефона открывается в «Чистовике»', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  await page.goto('/');
  // на компьютере по умолчанию — «Чистовик»
  await expect(page.getByRole('heading', { name: /План места происшествия/ })).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('banner').getByRole('button', { name: 'Открыть файл' }).click();
  await (await chooser).setFiles(OMP_PATH);

  const sheet = page.getByTestId('sheet');
  await expect(sheet).toContainText('ул. Широкая, 33, ауд. 214');
  await expect(sheet).toContainText('специалист Петров П. П.');
  // замеренная длина подписана числом
  await expect(sheet).toContainText('8,42');

  await page.getByRole('tab', { name: 'Метки' }).click();
  await expect(page.locator('.side [data-card]')).toHaveCount(2);
  await expect(page.locator('.side textarea').first()).toHaveValue('нож');

  await page.getByRole('tab', { name: 'Стены' }).click();
  await expect(page.locator('.side [data-card]')).toHaveCount(1);
});
