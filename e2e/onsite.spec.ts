// Сценарий «На месте» на телефоне: новый осмотр → проём → метки касанием плана → замер → файл .omp и PDF.
import { expect, test } from '@playwright/test';
import { OMP_PATH } from './paths';

test.beforeEach(async ({ page }) => {
  // как в Chrome на Android: окна «Сохранить как» нет — файл уходит в «Загрузки»
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
  page.on('dialog', d => void d.accept());
});

test('осмотр аудитории от начала до файла', async ({ page }) => {
  await page.goto('/');
  // на телефоне сразу открывается «На месте»
  await expect(page.getByRole('heading', { name: 'На месте' })).toBeVisible();
  const nav = (name: string) => page.getByRole('navigation', { name: 'Шаги осмотра' }).getByRole('button', { name });
  const toast = page.locator('#toast');
  // касания пальцами напрямую через Edge: в Playwright нет жестов перетаскивания и двумя пальцами
  const cdp = await page.context().newCDPSession(page);
  const finger = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ ...p, id })) });

  // 1. Помещение
  await nav('Помещение').click();
  await page.getByRole('button', { name: 'Новый осмотр' }).click();
  await page.getByLabel('Адрес, помещение').fill('ул. Широкая, 33, ауд. 214');
  await page.getByLabel('Составил (роль и ФИО)').fill('специалист Петров П. П.');
  await expect(page.getByLabel('Дата')).toHaveValue(/^\d\d\.\d\d\.\d{4}$/);
  const len = page.getByRole('textbox', { name: /Длина L/ });
  await len.fill('8,4');
  await len.press('Enter');
  await expect(len).toHaveValue('8,4');

  // 2. Проёмы: дверь на стене Б
  await page.getByRole('button', { name: 'Далее →' }).click();
  await expect(page.getByRole('heading', { name: /Проёмы/ })).toBeVisible();
  await page.getByRole('button', { name: /^Стена Б/ }).click();
  await page.getByRole('button', { name: '+ Дверь' }).click();
  await expect(page.getByRole('group', { name: 'Что на стене' }).getByRole('button', { name: 'Дверь' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Стена Б/ })).toContainText('1');

  // 3. Метки касанием плана: на полу и на стене А
  await nav('Метки').click();
  const sheet = page.getByTestId('sheet');
  await page.getByRole('button', { name: '+ Новая метка' }).click();
  const box = (await sheet.boundingBox())!;
  await sheet.tap({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(toast).toContainText('Метка № 1 поставлена');
  await page.getByLabel('Описание').fill('нож');
  await expect(page.getByLabel('Где')).toHaveValue('floor');

  await page.getByRole('button', { name: '+ Новая метка' }).click();
  const wallA = (await sheet.locator('text', { hasText: 'СТЕНА А' }).boundingBox())!;
  await sheet.tap({ position: { x: wallA.x - box.x + wallA.width / 2, y: wallA.y - box.y + wallA.height + 10 } });
  await expect(toast).toContainText('Метка № 2 поставлена');
  await expect(page.getByLabel('Где')).toHaveValue('wall');
  await expect(page.locator('label.f', { has: page.locator('span', { hasText: /^Стена$/ }) }).locator('select')).toHaveValue('A');
  await page.getByLabel('Описание').fill('след обуви');
  await expect(page.getByRole('group', { name: 'Метки' }).getByRole('button')).toHaveCount(2);

  // метку тянут пальцем сразу (без выбора заранее); после этого выбрана она
  await page.getByRole('group', { name: 'Метки' }).getByRole('button').first().click();
  const x0 = await page.getByRole('textbox', { name: /^X, м/ }).inputValue();
  await page.getByRole('group', { name: 'Метки' }).getByRole('button').nth(1).click();
  const mk1 = (await sheet.locator('[data-kind="mk"] circle').first().boundingBox())!;
  const m0 = { x: mk1.x + mk1.width / 2, y: mk1.y + mk1.height / 2 };
  await finger('touchStart', [m0]);
  for (const k of [10, 20, 30]) await finger('touchMove', [{ x: m0.x + k, y: m0.y }]);
  await finger('touchEnd', []);
  await expect(page.locator('.card .mk')).toHaveText('1');
  await expect(page.getByRole('textbox', { name: /^X, м/ })).not.toHaveValue(x0);

  // 5. Замеры: длина помещения рулеткой
  await nav('Замеры').click();
  await expect(page.getByText(/Замерено 0 из \d+/)).toBeVisible();
  await page.locator('.mrow', { hasText: 'Длина' }).getByRole('button', { name: 'Ввести' }).click();
  const dlg = page.locator('dialog.pw[open]');
  await dlg.getByLabel('Значение, м').fill('8,42');
  await dlg.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText(/Замерено 1 из \d+/)).toBeVisible();

  // 6. Итог: файл проекта и схема
  await nav('Итог').click();
  await expect(page.getByRole('heading', { name: /Осмотр завершён/ })).toBeVisible();
  await expect(page.getByText('Меток: 2')).toBeVisible();
  const omp = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить проект (.omp)' }).click();
  const file = await omp;
  expect(file.suggestedFilename()).toMatch(/^ОМП_\d{4}-\d\d-\d\d_.*\.omp$/);
  await file.saveAs(OMP_PATH);
  await expect(page.getByText(/Сохранено в файл в/)).toBeVisible();

  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF-схема' }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);

  // на «Итоге» план свёрнут в полоску (этап 11) — развернуть
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: 'Показать план' }).click();
  await expect(sheet).toBeVisible();

  // два пальца врозь — план крупнее; щипок, начатый на метке, не переключает шаг
  const c = (await sheet.boundingBox())!, cx = c.x + c.width / 2, cy = c.y + c.height / 2;
  const two = (d: number) => [{ x: cx - d, y: cy }, { x: cx + d, y: cy }];
  await finger('touchStart', two(20));
  for (const d of [40, 60, 80]) await finger('touchMove', two(d));
  await finger('touchEnd', []);
  await expect.poll(async () => (await sheet.boundingBox())!.width).toBeGreaterThan(c.width * 2.5);
  await expect(page.getByText('Меток: 2')).toBeVisible();

  // переключатель в «Чистовик» и обратно
  await page.getByRole('button', { name: 'Чистовик' }).click();
  await expect(page.getByRole('heading', { name: /План места происшествия/ })).toBeVisible();
  await page.getByRole('button', { name: 'На месте' }).click();
  await expect(page.getByRole('heading', { name: 'На месте' })).toBeVisible();
});
