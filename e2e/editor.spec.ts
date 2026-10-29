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

  // этап 11: вкладка «Выноски»; PDF, PNG, SVG — в одной кнопке «Скачать ▾»
  await expect(page.getByRole('tab', { name: 'Выноски' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Подписи' })).toHaveCount(0);
  await page.getByText('Скачать ▾').click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveCount(4);
  const pdf = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: /^PDF/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
  await expect(menu).toBeHidden();
  // фототаблица: в файле с телефона снимков нет — подсказка, куда их добавить
  await page.getByText('Скачать ▾').click();
  await menu.getByRole('menuitem', { name: /Фототаблица/ }).click();
  await expect(page.locator('#toast')).toContainText('Снимков нет');
  // шапка — в одну строку на экране ноутбука
  await page.setViewportSize({ width: 1366, height: 768 });
  const h = (await page.getByRole('banner').boundingBox())!.height;
  expect(h).toBeLessThan(60);
});
