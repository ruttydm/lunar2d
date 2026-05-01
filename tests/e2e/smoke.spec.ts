import { expect, test } from '@playwright/test';

test('loads the playable canvas and HUD', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#body-select')).toBeVisible();
  await expect(page.locator('#minimap-canvas')).toBeVisible();

  await page.keyboard.press('M');
  await page.keyboard.press('M');
  await page.keyboard.press('F3');

  await page.waitForTimeout(300);
  const canvasPixels = await page.locator('#game-canvas').evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const size = 96;
    const x = Math.max(0, Math.floor(c.width * 0.5 - size / 2));
    const y = Math.max(0, Math.floor(c.height * 0.62 - size / 2));
    const data = ctx.getImageData(x, y, size, size).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] || data[i + 1] || data[i + 2]) lit++;
    }
    return lit;
  });

  expect(canvasPixels).toBeGreaterThan(20);
});

test('mobile viewport exposes touch controls', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch controls are only expected on mobile/coarse-pointer layouts');
  await page.goto('/');
  await expect(page.locator('#touch-stick-flight')).toBeVisible();
  await expect(page.locator('#touch-fire')).toBeVisible();
});
