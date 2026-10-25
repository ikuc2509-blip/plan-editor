// Этап 10 на компьютере: пакет распознавания → снимок стены → модель предлагает окна, дверь,
// радиатор → принять. Снимок рисуется в самом тесте (настоящих снимков в репозитории нет).
// Нужен собранный пакет (node scripts/pack.mjs) — без него тест пропускается.
import { expect, test, type Page } from '@playwright/test';
import { PACK, partPath } from '../src/recognize/packInfo';

/** стена на рисунке 2200 × 700: рамка 100…2100 × 50…650 (как стена 10 × 3 м) */
const QUAD = [{ x: 100 / 2200, y: 50 / 700 }, { x: 2100 / 2200, y: 50 / 700 }, { x: 2100 / 2200, y: 650 / 700 }, { x: 100 / 2200, y: 650 / 700 }];

/** Нарисованная стена: два окна с переплётом, радиатор под первым, дверь справа */
async function fakeWall(page: Page) {
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 2200; c.height = 700;
    const g = c.getContext('2d')!;
    g.fillStyle = '#777'; g.fillRect(0, 0, 2200, 700);
    g.translate(100, 50);
    g.fillStyle = '#e8e4da'; g.fillRect(0, 0, 2000, 600);
    g.fillStyle = '#b9b2a3'; g.fillRect(0, 560, 2000, 40);
    const win = (x: number) => {
      g.fillStyle = '#f7f7f4'; g.fillRect(x, 130, 300, 300);
      const grd = g.createLinearGradient(x, 140, x + 280, 420);
      grd.addColorStop(0, '#9cc3e6'); grd.addColorStop(1, '#d9ecf8');
      g.fillStyle = grd; g.fillRect(x + 14, 144, 272, 272);
      g.fillStyle = '#f7f7f4'; g.fillRect(x + 143, 144, 14, 272); g.fillRect(x + 14, 230, 272, 12);
      g.fillStyle = '#ddd'; g.fillRect(x - 15, 430, 330, 16);
    };
    win(250); win(900);
    g.fillStyle = '#7a5230'; g.fillRect(1560, 90, 230, 470);
    g.strokeStyle = '#5a3a20'; g.lineWidth = 6; g.strokeRect(1585, 120, 180, 180); g.strokeRect(1585, 330, 180, 200);
    g.fillStyle = '#d4af37'; g.beginPath(); g.arc(1755, 340, 9, 0, 7); g.fill();
    g.fillStyle = '#f0f0f0'; g.fillRect(270, 470, 260, 70);
    g.fillStyle = '#c8c8c8';
    for (let i = 0; i < 13; i++) g.fillRect(275 + i * 20, 474, 6, 62);
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg', 0.92));
    const file = new File([blob], 'wall.jpg', { type: 'image/jpeg' });
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      if (this.type !== 'file') return orig.call(this);
      HTMLInputElement.prototype.click = orig;
      const dt = new DataTransfer();
      dt.items.add(file);
      this.files = dt.files;
      this.dispatchEvent(new Event('change'));
    };
  });
}

test('модель предлагает окна, дверь и радиатор; принятое — «условно», «предложено моделью»', async ({ page }) => {
  test.setTimeout(300_000);
  page.on('dialog', d => void d.accept());
  await page.goto('/');
  const r = await page.request.head(partPath(PACK.files[1]!, 0));
  test.skip(!r.ok(), 'пакет распознавания не собран: node scripts/pack.mjs');

  const tabBtn = (name: string) => page.getByRole('tab', { name, exact: true });
  await tabBtn('Помещение').click();
  await page.getByRole('button', { name: 'Пустой план' }).click();
  // чистый лист (этап 12): прямоугольная заготовка 10 × 6 × 3 м
  await page.getByRole('button', { name: 'Взять заготовку (прямоугольник)' }).first().click();

  // пакет: скачать по кнопке, проверка отпечатков
  await tabBtn('Файл').click();
  await page.getByRole('button', { name: /^Скачать пакет/ }).click();
  await expect(page.getByText(/Пакет скачан и проверен/)).toBeVisible({ timeout: 120_000 });

  // снимок стены А — выпрямить по четырём углам
  await tabBtn('Фото').click();
  await fakeWall(page);
  await page.getByRole('button', { name: '+ Из файлов' }).click();
  await page.locator('.thumbs .thumb').first().click();
  await page.getByRole('button', { name: 'Выпрямить на стену' }).click();
  const dlg = page.locator('dialog.rect[open]');
  const pad = dlg.getByTestId('pointpad');
  await expect(pad).toBeVisible();
  const box = (await pad.boundingBox())!;
  for (const q of QUAD) await pad.click({ position: { x: q.x * box.width, y: q.y * box.height } });
  await dlg.getByRole('button', { name: 'Готово' }).click();
  await expect(dlg).toHaveCount(0);

  // распознать
  await tabBtn('Стены').click();
  await page.getByRole('button', { name: 'Найти окна, двери…' }).click();
  await expect(page.getByRole('heading', { name: 'Предложения модели: 4' })).toBeVisible({ timeout: 120_000 });
  const sheet = page.getByTestId('sheet');
  await expect(sheet.locator('[data-sugg]')).toHaveCount(4);
  const types = await page.locator('.card.sugg select').evaluateAll(els => els.map(e => (e as HTMLSelectElement).value).sort());
  expect(types).toEqual(['door', 'radiator', 'window', 'window']);
  // до принятия на лист в файлы ничего не попадает: элементов стены нет
  await expect(page.locator('.side [data-card]').filter({ hasText: 'Отступ' })).toHaveCount(0);

  // щелчок по рамке на листе — её карточка выбрана; принять одну
  await sheet.locator('[data-sugg]').first().click();
  const chosen = page.locator('.card.sugg.sel');
  await expect(chosen).toHaveCount(1);
  await chosen.getByRole('button', { name: 'Принять' }).click();
  await expect(page.getByRole('heading', { name: 'Предложения модели: 3' })).toBeVisible();
  await expect(page.locator('.side .origin').filter({ hasText: /предложено моделью, \d+ %/ })).toHaveCount(1);

  // окно сравнения: снимок с рамками и развёртка; принять остальные
  await page.getByRole('button', { name: 'Сравнить (3)' }).click();
  const cmp = page.locator('dialog.rect[open]');
  await expect(cmp.getByTestId('cmp-photo').locator('[data-sugg]')).toHaveCount(3);
  await expect(cmp.getByTestId('cmp-sheet').locator('[data-sugg]')).toHaveCount(3);
  await cmp.getByRole('button', { name: 'Принять всё (3)' }).click();
  await expect(cmp.getByText('Предложений по этому снимку нет.')).toBeVisible();
  await cmp.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.locator('.side .origin').filter({ hasText: 'предложено моделью' })).toHaveCount(4);
  await expect(sheet.locator('[data-sugg]')).toHaveCount(0);

  // «Принять всё» — один шаг отмены
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.locator('.side .origin').filter({ hasText: 'предложено моделью' })).toHaveCount(1);
});
