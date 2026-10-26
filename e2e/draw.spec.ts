// Этап 12 на телефоне: комнату рисуют пальцем — крестик над пальцем, план на весь экран (ответы 1А 2А).
import { expect, test } from '@playwright/test';

test('пальцем: крестик над пальцем, угол — когда отпустили; план на весь экран, пока рисуют', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый осмотр' }).click();
  await page.getByRole('button', { name: 'Нарисовать комнату' }).first().click();
  const steps = page.getByRole('navigation', { name: 'Шаги осмотра' });
  await expect(steps).toBeHidden();
  await expect(page.getByRole('toolbar', { name: 'Рисование комнаты' })).toContainText('крестиком');

  // касания пальцем напрямую через Edge (в Playwright нет перетаскивания пальцем)
  const cdp = await page.context().newCDPSession(page);
  const finger = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 0 }] });
  const sheet = page.getByTestId('sheet');
  const cross = sheet.locator('path[stroke="#D0332B"]');
  const b = (await sheet.boundingBox())!;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  // угол — там, где крестик: на 70 пикселей выше пальца
  const corner = async (x: number, y: number, check = false) => {
    await finger('touchStart', x - 20, y + 90);
    await finger('touchMove', x, y + 70);
    if (check) await expect(cross).toHaveCount(1);
    await finger('touchEnd', x, y + 70);
  };
  await corner(cx - 80, cy - 60, true);
  await expect(cross).toHaveCount(0);
  await corner(cx + 80, cy - 60);
  await corner(cx + 80, cy + 60);
  await corner(cx - 80, cy + 60);
  await expect(page.getByRole('toolbar', { name: 'Рисование комнаты' })).toContainText('наведите крестик на первый угол');
  await corner(cx - 80, cy - 60);

  await expect(page.locator('#toast')).toContainText('Комната готова');
  await expect(steps).toBeVisible();
  for (const k of 'АБВГ') await expect(sheet).toContainText(`СТЕНА ${k}`);
});
