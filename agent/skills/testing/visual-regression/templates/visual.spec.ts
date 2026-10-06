// tests/visual.spec.ts — Playwright visual comparisons (https://playwright.dev/docs/test-snapshots)
// First run writes baselines to tests/visual.spec.ts-snapshots/. Update deliberately with:
//   npx playwright test tests/visual.spec.ts --update-snapshots
import { test, expect } from '@playwright/test';

test.describe('visual', () => {
  test.beforeEach(async ({ page }) => {
    // Freeze time so dates/clocks render the same every run.
    await page.clock.setFixedTime(new Date('2024-01-01T10:00:00Z'));
  });

  test('home - desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('home-default-1280.png', {
      fullPage: true,
      animations: 'disabled',
      mask: [page.locator('[data-testid="ad"]'), page.locator('time')],
      maxDiffPixelRatio: 0.01, // allow up to 1% of pixels to differ
      threshold: 0.2, // per-pixel colour tolerance, 0..1 (YIQ)
    });
  });

  test('home - mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page).toHaveScreenshot('home-default-375.png', { fullPage: true, animations: 'disabled' });
  });

  test('header component', async ({ page }) => {
    await page.goto('/');
    // Element-level snapshot: smaller and more stable than full page.
    await expect(page.getByRole('banner')).toHaveScreenshot('header.png', { maxDiffPixels: 50 });
  });
});

// Optional project-wide defaults in playwright.config.ts:
// expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
