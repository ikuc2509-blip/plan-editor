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
  await page.getByRole('button', { name: 'Расширить комнату' }).click();
  // небольшой, чтобы весь был на экране
  await dragPx(fl(0, 3), fl(4, 4));
  await expect(page.locator('#toast')).toContainText('слит с комнатой');
  // Г: стены 6, 3, 2, 1, 4, 4 м
  await expect(page.getByRole('textbox', { name: /^Стена Г, м/ })).toHaveValue('1');
  await expect(page.getByRole('textbox', { name: /^Стена Е, м/ })).toHaveValue('4');

  // не касается комнаты — отказ, комната прежняя
  await page.getByRole('button', { name: 'Расширить комнату' }).click();
  await dragPx(fl(5, 4), fl(7, 6));
  await expect(page.locator('#toast')).toContainText('должен касаться комнаты');
  await expect(page.getByRole('textbox', { name: /^Стена Е, м/ })).toHaveValue('4');
});

test('выровнять стены: углы стащили вкось — кнопка возвращает прямые углы', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Помещение', exact: true }).click();
  await page.getByRole('button', { name: 'Пустой план' }).click();
  const sheet = page.getByTestId('sheet');
  await page.getByRole('button', { name: 'Прямоугольником' }).first().click();
  const box = (await sheet.boundingBox())!, p = await at(page, -3, -2), q = await at(page, 3, 2);
  await page.mouse.move(box.x + p.x, box.y + p.y); await page.mouse.down();
  await page.mouse.move(box.x + q.x, box.y + q.y); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Выровнять стены' })).toHaveCount(0);
  // угол 2 — вкось, с Alt (без прилипания к соседям)
  const c = (await sheet.locator('[data-corner="2"]').boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(c.x + 40, c.y + 25, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.getByRole('button', { name: 'Выровнять стены' }).click();
  await expect(page.locator('#toast')).toContainText('Стены выровнены');
  await expect(page.getByRole('button', { name: 'Выровнять стены' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /^Стена Г, м/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Стена Д, м/ })).toHaveCount(0);
});

test('соседнее помещение: кабинет 6 м и подсобка 3 м — отдельно, перегородка без развёртки', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Помещение', exact: true }).click();
  await page.getByRole('button', { name: 'Пустой план' }).click();
  const sheet = page.getByTestId('sheet');
  await page.getByRole('button', { name: 'Прямоугольником' }).first().click();
  const b0 = (await sheet.boundingBox())!, p = await at(page, -3, -1.5), q = await at(page, 3, 1.5);
  await page.mouse.move(b0.x + p.x, b0.y + p.y); await page.mouse.down();
  await page.mouse.move(b0.x + q.x, b0.y + q.y); await page.mouse.up();

  // по углам 0 (0; 0) и 2 (6; 3 м) — где пол после перестройки листа
  await page.getByRole('button', { name: 'Соседнее помещение' }).click();
  const c0 = (await sheet.locator('[data-corner="0"]').boundingBox())!, c2 = (await sheet.locator('[data-corner="2"]').boundingBox())!;
  const fl = (x: number, y: number) => ({ x: c0.x + c0.width / 2 + (x / 6) * (c2.x - c0.x), y: c0.y + c0.height / 2 + (y / 3) * (c2.y - c0.y) });
  const s = fl(6, 0), e = fl(9, 3);
  await page.mouse.move(s.x, s.y); await page.mouse.down();
  await page.mouse.move(e.x, e.y, { steps: 3 }); await page.mouse.up();

  await expect(page.locator('#toast')).toContainText('Соседнее помещение готово');
  await expect(page.getByRole('heading', { name: 'Соседние помещения' })).toBeVisible();
  // кабинет — прежние 6 м, а не 9
  await expect(page.getByRole('textbox', { name: /^Стена А, м/ }).first()).toHaveValue('6');
  await page.getByRole('textbox', { name: 'Название' }).fill('подсобка');
  await expect(sheet).toContainText('ПОДСОБКА');
  await expect(sheet).not.toContainText('СТЕНА Б (развёртка)');

  await page.getByRole('button', { name: 'Сделать основным' }).click();
  await expect(page.locator('#toast')).toContainText('Основное помещение — «подсобка»');
});

test('развёртки: налезают во внутреннем углу — отнести мышью, вернуть, скрыть галочкой', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  await page.goto('/');
  await page.getByRole('tab', { name: 'Помещение', exact: true }).click();
  await page.getByRole('button', { name: 'Пустой план' }).click();
  await page.getByRole('button', { name: 'Нарисовать комнату' }).first().click();
  const sheet = page.getByTestId('sheet');
  for (const [x, y] of [[-3, -2.5], [3, -2.5], [3, 0.5], [1, 0.5], [1, 2.5], [-3, 2.5], [-3, -2.5]] as const) {
    await sheet.click({ position: await at(page, x, y) });
  }
  await expect(page.locator('#toast')).toContainText('Комната готова');
  const warn = page.getByText('налезают друг на друга');
  await expect(warn).toContainText('Развёртки В и Г');

  // точка на пустом месте развёртки В, где сверху ничего не лежит
  const pt = await page.evaluate(() => {
    const r = document.querySelector('[data-elev="w3"]')!.getBoundingClientRect();
    for (let fy = 0.95; fy > 0.05; fy -= 0.05) for (let fx = 0.1; fx < 0.95; fx += 0.1) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y)?.closest('[data-elev]')?.getAttribute('data-elev') === 'w3') return { x, y };
    }
    return null;
  });
  expect(pt).not.toBeNull();
  const b = (await sheet.boundingBox())!;
  const mm = b.height / 297; // пикселей на мм листа
  await page.mouse.move(pt!.x, pt!.y);
  await page.mouse.down();
  await page.mouse.move(pt!.x, pt!.y + 20 * mm, { steps: 5 });
  await page.mouse.move(pt!.x, pt!.y + 40 * mm, { steps: 5 });
  await page.mouse.up();
  await expect(warn).toHaveCount(0);
  await expect(sheet.locator('line[stroke-dasharray="1.5 1"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Вернуть развёртки на место' }).click();
  await expect(warn).toBeVisible();
  await expect(page.getByRole('button', { name: 'Вернуть развёртки на место' })).toHaveCount(0);

  // снять галочку у стены В — развёртки нет, в примечаниях сказано
  await page.getByRole('checkbox', { name: 'развёртка' }).nth(2).uncheck();
  await expect(warn).toHaveCount(0);
  await expect(sheet).not.toContainText('СТЕНА В (развёртка)');
  await expect(sheet).toContainText('Развёртка стены В не показана.');
});

test('нарисованная Г-комната: окно, дверь, метка, мебель, замеры, PDF', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  await page.goto('/');
  await page.getByRole('tab', { name: 'Помещение', exact: true }).click();
  await page.getByRole('button', { name: 'Пустой план' }).click();
  await page.getByRole('button', { name: 'Нарисовать комнату' }).first().click();
  const sheet = page.getByTestId('sheet');
  for (const [x, y] of [[-3, -2.5], [3, -2.5], [3, 0.5], [1, 0.5], [1, 2.5], [-3, 2.5], [-3, -2.5]] as const) {
    await sheet.click({ position: await at(page, x, y) });
  }
  await expect(page.locator('#toast')).toContainText('Комната готова');

  // окно и дверь — на стенах нарисованной комнаты, на развёртке видны
  await page.getByRole('tab', { name: 'Стены', exact: true }).click();
  await page.getByRole('button', { name: '+ Окно' }).click();
  await page.getByRole('button', { name: '+ Дверь' }).click();
  await expect(page.locator('.side [data-card]')).toHaveCount(2);
  await expect(sheet).toContainText('дверь');

  // метка на полу — привязки к стенам
  await page.getByRole('tab', { name: 'Метки' }).click();
  await page.getByRole('button', { name: '+ Метка' }).click();
  await expect(page.locator('.side [data-card]')).toHaveCount(1);
  const tie = await sheet.locator('[data-measure^="tie:"]').count();
  expect(tie).toBeGreaterThan(0);

  // мебель
  await page.getByRole('tab', { name: 'Мебель' }).click();
  await page.getByRole('button', { name: '+ Добавить' }).click();
  await expect(page.locator('.side [data-card]')).toHaveCount(1);

  // замеры: длины стен нарисованной комнаты в списке
  await page.getByRole('tab', { name: 'Замеры' }).click();
  await expect(page.locator('.side')).toContainText('Помещение — стена А');
  await expect(page.locator('.side')).toContainText('Метка № 1 — до стены');

  // PDF
  await page.getByText('Скачать ▾').click();
  const pdf = page.waitForEvent('download');
  await page.getByRole('menu').getByRole('menuitem', { name: /^PDF/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
});

test('фототаблица: снимок, стрелка на метку, подпись, PDF', async ({ page }) => {
  page.on('dialog', d => void d.accept());
  await page.goto('/');
  await page.getByRole('tab', { name: 'Помещение', exact: true }).click();
  await page.getByRole('button', { name: 'Пример: наша аудитория' }).click();
  // учебный «снимок» — нарисованная картинка
  const jpeg = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600;
    const g = c.getContext('2d')!; g.fillStyle = '#ccc'; g.fillRect(0, 0, 800, 600); g.fillStyle = '#a63'; g.fillRect(200, 300, 300, 100);
    return c.toDataURL('image/jpeg').split(',')[1]!;
  }), 'base64');
  await page.getByRole('tab', { name: 'Фото' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '+ Из файлов' }).click();
  await (await chooser).setFiles({ name: 'uchebnyi.jpg', mimeType: 'image/jpeg', buffer: jpeg });

  await page.getByRole('button', { name: /^Стрелки на снимке/ }).click();
  const img = page.getByTestId('arrows-photo');
  await expect(img).toBeVisible();
  const b = (await img.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.45, b.y + b.height * 0.55);
  await expect(img.locator('[data-end="tail"]')).toHaveCount(1);
  await expect(page.locator('dialog.arrows')).toContainText('Стрелкой № 1 указано: предметы на столе преподавателя');
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByRole('button', { name: 'Стрелки на снимке (1)' })).toBeVisible();

  // своя подпись — стрелка дописывается сама
  await page.getByLabel('Подпись в фототаблице').fill('Стол преподавателя');
  await expect(page.locator('.side')).toContainText('В фототаблице: Фото № 1. Стол преподавателя. Стрелкой № 1 указано:');

  await page.getByText('Скачать ▾').click();
  const pdf = page.waitForEvent('download');
  await page.getByRole('menu').getByRole('menuitem', { name: /Фототаблица/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^fototablica.*\.pdf$/);
});
