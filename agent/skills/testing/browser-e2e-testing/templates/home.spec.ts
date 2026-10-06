// tests/home.spec.ts — specs use page objects; assertions live here, not in the page objects.
import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';

test.describe('Home page', () => {
  test('smoke: loads without console errors', async ({ page }) => {
    const home = new HomePage(page);
    const errors = home.trackErrors();
    await home.goto();
    await home.expectLoaded();
    expect(errors).toEqual([]);
  });

  test('critical path: search shows results', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.search('playwright');
    await expect(home.results).toBeVisible();
    await expect(home.results).toContainText(/playwright/i);
  });

  test('error: unknown route shows a not-found page', async ({ page }) => {
    const res = await page.goto('/__does-not-exist__');
    expect(res?.status()).toBe(404);
  });

  test('responsive: mobile layout has no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const home = new HomePage(page);
    await home.goto();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  // Accessibility (optional): npm i -D @axe-core/playwright, then:
  // import AxeBuilder from '@axe-core/playwright';
  // test('a11y: no serious violations', async ({ page }) => {
  //   await new HomePage(page).goto();
  //   const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  //   expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  // });
});
