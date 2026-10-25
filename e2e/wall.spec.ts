// Этап 9 на телефоне: снимок стены под углом → четыре угла → снимок на развёртке стены А.
// Снимок рисуется в самом тесте (условная стена с окном) — настоящих снимков в репозитории нет.
import { expect, test, type Page } from '@playwright/test';

/** углы «стены» на рисунке 1600 × 1200, доли: вверху слева, вверху справа, внизу справа, внизу слева */
const QUAD = [{ x: 0.12, y: 0.12 }, { x: 0.88, y: 0.25 }, { x: 0.88, y: 0.75 }, { x: 0.12, y: 0.88 }];

/** Подложить нарисованный снимок вместо окна выбора файла */
async function fakeWallPhoto(page: Page) {
  await page.evaluate(async q => {
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 1200;
    const g = c.getContext('2d')!;
    g.fillStyle = '#9bb'; g.fillRect(0, 0, 1600, 1200);
    const P = q.map(p => [p.x * 1600, p.y * 1200] as const);
    g.fillStyle = '#eee'; g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
    // «окно» — по середине стены, в долях стены 0,4…0,6 по ширине и 0,3…0,6 по высоте (приблизительно)
    const at = (u: number, v: number) => {
      const top = [P[0]![0] + (P[1]![0] - P[0]![0]) * u, P[0]![1] + (P[1]![1] - P[0]![1]) * u];
      const bot = [P[3]![0] + (P[2]![0] - P[3]![0]) * u, P[3]![1] + (P[2]![1] - P[3]![1]) * u];
      return [top[0]! + (bot[0]! - top[0]!) * v, top[1]! + (bot[1]! - top[1]!) * v] as const;
    };
    g.fillStyle = '#246'; g.beginPath();
    [at(0.4, 0.3), at(0.6, 0.3), at(0.6, 0.6), at(0.4, 0.6)].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath(); g.fill();
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg', 0.9));
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
  }, QUAD);
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => void d.accept());
});

test('снимок стены выпрямляется и ложится на развёртку', async ({ page }) => {
  await page.goto('/');
  const nav = (name: string) => page.getByRole('navigation', { name: 'Шаги осмотра' }).getByRole('button', { name });
  await nav('Помещение').click();
  await page.getByRole('button', { name: 'Новый осмотр' }).click();

  // снимок из «файла»
  await nav('Фото').click();
  await fakeWallPhoto(page);
  await page.getByRole('button', { name: '+ Из файлов' }).click();
  await expect(page.getByRole('heading', { name: /Снимки \(1\)/ })).toBeVisible();
  await page.locator('.thumbs .thumb').first().click();
  await page.getByRole('button', { name: 'Выпрямить на стену' }).click();

  // четыре угла — в перепутанном порядке: приложение расставит само
  const dlg = page.locator('dialog.rect[open]');
  const pad = dlg.getByTestId('pointpad');
  await expect(pad).toBeVisible();
  const box = (await pad.boundingBox())!;
  for (const i of [0, 2, 1, 3]) await pad.tap({ position: { x: QUAD[i]!.x * box.width, y: QUAD[i]!.y * box.height } });
  await expect(dlg.getByText(/Углы можно поправить/)).toBeVisible();
  await expect(dlg.getByRole('group', { name: 'Стена' }).getByRole('button', { name: 'Стена А' })).toHaveAttribute('aria-pressed', 'true');
  await dlg.getByRole('button', { name: 'Готово' }).click();
  await expect(dlg).toHaveCount(0);

  // на развёртке стены А — выпрямленная картинка (на шаге «Фото» план свёрнут — смотрим на «Проёмах»)
  await nav('Проёмы').click();
  await expect(page.getByTestId('sheet').locator('image')).toHaveCount(1);
  await expect(page.getByText('Стена А: снимок № 1')).toBeVisible();

  // обвести окно по снимку: два угла на развёртке; «окно» на выпрямленном снимке — примерно 0,30…0,50 × 0,30…0,60
  const sheet = page.getByTestId('sheet');
  await page.getByRole('button', { name: 'Окно', exact: true }).click();
  const sb = (await sheet.boundingBox())!, ib = (await sheet.locator('image').boundingBox())!;
  const onImg = (u: number, v: number) => ({ x: ib.x - sb.x + u * ib.width, y: ib.y - sb.y + v * ib.height });
  await sheet.tap({ position: onImg(0.31, 0.32) });
  await expect(page.getByText(/Теперь — противоположный угол/).first()).toBeVisible();
  await sheet.tap({ position: onImg(0.49, 0.58) });
  await expect(page.locator('#toast')).toContainText('Окно: обведено по снимку');
  const card = page.locator('.os-panel .card').filter({ hasText: 'Обведено по снимку № 1' });
  await expect(card).toBeVisible();
  await expect(card.locator('.chip', { hasText: 'по фото' })).toHaveCount(4);
  await card.getByRole('button', { name: 'Показать' }).click();
  await expect(page.locator('dialog.viewer[open] .vbox')).toBeVisible();
  await page.locator('dialog.viewer[open]').click();

  // масштаб по фото: ширина окна на самом деле 1,5 м → длина стены меньше 10 м
  await page.getByRole('button', { name: 'Масштаб по фото' }).click();
  const dlg2 = page.locator('dialog.rect[open]');
  const pad2 = dlg2.getByTestId('pointpad');
  await expect(pad2).toBeVisible();
  const b2 = (await pad2.boundingBox())!;
  await pad2.tap({ position: { x: 0.3 * b2.width, y: 0.45 * b2.height } });
  await pad2.tap({ position: { x: 0.5 * b2.width, y: 0.45 * b2.height } });
  await dlg2.getByLabel('Настоящая длина отрезка, м').fill('1,5');
  await expect(dlg2.getByText(/Отрезок вдоль стены\. По снимку выходит: длина стены А ≈ 7,5 м/)).toBeVisible();
  await dlg2.getByRole('button', { name: 'Применить' }).click();
  await expect(page.locator('#toast')).toContainText('Статус — «условно»');
  await nav('Помещение').click();
  await expect(page.getByRole('textbox', { name: /Длина L/ })).toHaveValue(/^7,\d+$/);
});

test.describe('камера «Снять стену»', () => {
  test('пункт «Стена А целиком»: рамка-подсказка, снимок привязан к стене, сразу «Выпрямить»', async ({ page }) => {
    // поддельная камера не отдаёт полноразмерный снимок — берётся кадр видео, как в браузерах без ImageCapture
    await page.addInitScript(() => { Object.defineProperty(window, 'ImageCapture', { value: undefined }); });
    await page.goto('/');
    const nav = (name: string) => page.getByRole('navigation', { name: 'Шаги осмотра' }).getByRole('button', { name });
    await nav('Помещение').click();
    await page.getByRole('button', { name: 'Новый осмотр' }).click();
    await nav('Фото').click();
    await page.locator('.shot', { hasText: 'Стена А' }).getByRole('button', { name: 'Снять' }).click();
    const cam = page.locator('dialog.camera[open]');
    await expect(cam.locator('.cam-guide')).toBeVisible();
    await expect(cam.locator('.g-top')).toHaveText('потолок');
    await cam.getByRole('button', { name: 'Снять' }).click();
    await cam.getByRole('button', { name: 'Выпрямить' }).click();
    const dlg = page.locator('dialog.rect[open]');
    await expect(dlg.getByTestId('pointpad')).toBeVisible();
    await expect(dlg.getByRole('group', { name: 'Стена' }).getByRole('button', { name: 'Стена А' })).toHaveAttribute('aria-pressed', 'true');
    await dlg.getByRole('button', { name: 'Закрыть' }).click();
    await expect(page.locator('.shot', { hasText: 'Стена А' })).toHaveClass(/done/);
  });
});

test('длинная стена из двух кадров: до ориентира 4,2 м и от него', async ({ page }) => {
  await page.goto('/');
  const nav = (name: string) => page.getByRole('navigation', { name: 'Шаги осмотра' }).getByRole('button', { name });
  await nav('Помещение').click();
  await page.getByRole('button', { name: 'Новый осмотр' }).click();
  await nav('Фото').click();
  await fakeWallPhoto(page);
  await page.getByRole('button', { name: '+ Из файлов' }).click();
  await page.locator('.thumbs .thumb').first().click();

  const dlg = page.locator('dialog.rect[open]');
  /** один кадр: четыре угла и край, который кончается на ориентире */
  const frame = async (edge: 'Левый край кадра' | 'Правый край кадра') => {
    await page.getByRole('button', { name: 'Выпрямить на стену' }).click();
    const pad = dlg.getByTestId('pointpad');
    await expect(pad).toBeVisible();
    const box = (await pad.boundingBox())!;
    for (const q of QUAD) await pad.tap({ position: { x: q.x * box.width, y: q.y * box.height } });
    await dlg.getByRole('group', { name: edge }).getByRole('button', { name: 'Ориентир' }).click();
    const off = dlg.getByRole('textbox', { name: /От левого угла стены/ });
    await off.fill('4,2');
    await off.press('Enter');
    await dlg.getByRole('button', { name: 'Готово' }).click();
    await expect(dlg).toHaveCount(0);
  };
  await frame('Правый край кадра');
  await frame('Левый край кадра');

  await nav('Проёмы').click();
  const imgs = page.getByTestId('sheet').locator('image');
  await expect(imgs).toHaveCount(2);
  // кадры встали рядом: ширины — как 4,2 к 5,8
  const [a, b] = [(await imgs.nth(0).boundingBox())!, (await imgs.nth(1).boundingBox())!];
  expect(a.width / b.width).toBeCloseTo(4.2 / 5.8, 1);
  expect(b.x).toBeCloseTo(a.x + a.width, 0);
  await expect(page.locator('.os-panel .card').filter({ hasText: '0–4,2 м' })).toBeVisible();
  await expect(page.locator('.os-panel .card').filter({ hasText: '4,2–10 м' })).toBeVisible();
});
