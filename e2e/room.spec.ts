// Этап 12 на компьютере: чистый лист → нарисовать Г-образную комнату щелчками → длины стен.
import { expect, test, type Page } from '@playwright/test';

/** Точка пола (м) на чистом листе A3 → место щелчка: масштаб рисования 1:100, начало — середина чертежа (156; 156 мм) */
async function at(page: Page, x: number, y: number) {
  const b = (await page.getByTestId('sheet').boundingBox())!;
  return { x: ((156 + x * 10) / 420) * b.width, y: ((156 + y * 10) / 297) * b.height };
}

test('чистый лист: нарисовать Г-образную комнату и вписать длину стены', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  await page.goto('/');
  await page.getByRole('tab', { name: 'Помещение', exact: true }).click();
  await page.getByRole('button', { name: 'Пустой план' }).click();
  await expect(page.getByText('Комнаты пока нет').first()).toBeVisible();

  await page.getByRole('button', { name: 'Нарисовать комнату' }).first().click();
  const sheet = page.getByTestId('sheet');
  // Г: 6 × 5 м с вырезом 2 × 2 справа снизу; последний щелчок — по первому углу
  for (const [x, y] of [[-3, -2.5], [3, -2.5], [3, 0.5], [1, 0.5], [1, 2.5], [-3, 2.5], [-3, -2.5]] as const) {
    await sheet.click({ position: await at(page, x, y) });
  }
  await expect(page.getByRole('toolbar', { name: 'Рисование комнаты' })).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Комната готова');
  for (const k of 'АБВГДЕ') await expect(sheet).toContainText(`СТЕНА ${k} (развёртка)`);
  await expect(page.getByRole('textbox', { name: /^Стена А, м/ })).toHaveValue('6');
  await expect(page.getByRole('textbox', { name: /^Стена Д, м/ })).toHaveValue('4');

  // длиннее стена А — комната растягивается, стена Д тоже
  const a = page.getByRole('textbox', { name: /^Стена А, м/ });
  await a.fill('7');
  await a.press('Enter');
  await expect(page.getByRole('textbox', { name: /^Стена Д, м/ })).toHaveValue('5');
  await expect(sheet).toContainText('А: ____ м');

  // нарисовать заново — снова чистый лист с рисованием
  await page.getByRole('button', { name: 'Нарисовать комнату заново' }).click();
  await expect(page.getByRole('toolbar', { name: 'Рисование комнаты' })).toBeVisible();
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByText('Комнаты пока нет').first()).toBeVisible();
});

test('фигуры: прямоугольник, к нему пристроен второй — Г-образная комната', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  // весь лист на экране — перетаскивание за его краем не доходит до листа
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Помещение', exact: true }).click();
  await page.getByRole('button', { name: 'Пустой план' }).click();
  const sheet = page.getByTestId('sheet');
  const drag = async (a: [number, number], b: [number, number]) => {
    const box = (await sheet.boundingBox())!, p = await at(page, ...a), q = await at(page, ...b);
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.mouse.down();
    await page.mouse.move(box.x + (p.x + q.x) / 2, box.y + (p.y + q.y) / 2);
    await page.mouse.move(box.x + q.x, box.y + q.y);
    await page.mouse.up();
  };
  await page.getByRole('button', { name: 'Прямоугольником' }).first().click();
  await drag([-3, -2.5], [3, 0.5]);
  await expect(page.getByRole('textbox', { name: /^Стена Г, м/ })).toHaveValue('3');
  await expect(page.getByRole('textbox', { name: /^Стена Д, м/ })).toHaveCount(0);

  // лист перестроился под комнату: где теперь пол — по углам 0 (0; 0) и 2 (6; 3 м)
  const c0 = (await sheet.locator('[data-corner="0"]').boundingBox())!, c2 = (await sheet.locator('[data-corner="2"]').boundingBox())!;
  const box = (await sheet.boundingBox())!;
  const fl = (x: number, y: number): [number, number] => {
    const sx = c0.x + c0.width / 2 + (x / 6) * (c2.x - c0.x), sy = c0.y + c0.height / 2 + (y / 3) * (c2.y - c0.y);
    return [sx - box.x, sy - box.y];
  };
  const dragPx = async (p: [number, number], q: [number, number]) => {
    await page.mouse.move(box.x + p[0], box.y + p[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + (p[0] + q[0]) / 2, box.y + (p[1] + q[1]) / 2);
    await page.mouse.move(box.x + q[0], box.y + q[1]);
    await page.mouse.up();
  };
  await page.getByRole('button', { name: 'Пристроить прямоугольник' }).click();
  // небольшой, чтобы весь был на экране
  await dragPx(fl(0, 3), fl(4, 4));
  await expect(page.locator('#toast')).toContainText('слит с комнатой');
  // Г: стены 6, 3, 2, 1, 4, 4 м
  await expect(page.getByRole('textbox', { name: /^Стена Г, м/ })).toHaveValue('1');
  await expect(page.getByRole('textbox', { name: /^Стена Е, м/ })).toHaveValue('4');

  // не касается комнаты — отказ, комната прежняя
  await page.getByRole('button', { name: 'Пристроить прямоугольник' }).click();
  await dragPx(fl(5, 4), fl(7, 6));
  await expect(page.locator('#toast')).toContainText('должен касаться комнаты');
  await expect(page.getByRole('textbox', { name: /^Стена Е, м/ })).toHaveValue('4');
});
