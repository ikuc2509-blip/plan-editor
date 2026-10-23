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

  // на развёртке стены А — выпрямленная картинка
  await expect(page.getByTestId('sheet').locator('image')).toHaveCount(1);
  await nav('Проёмы').click();
  await expect(page.getByText('Стена А: снимок № 1')).toBeVisible();
});
