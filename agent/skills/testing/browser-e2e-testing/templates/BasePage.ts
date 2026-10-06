// tests/pages/BasePage.ts — shared helpers for every page object.
import { expect, type Locator, type Page } from '@playwright/test';

export class BasePage {
  readonly page: Page;
  /** Path relative to baseURL from playwright.config.ts, e.g. '/' or '/login'. */
  readonly path: string;

  constructor(page: Page, path = '/') {
    this.page = page;
    this.path = path;
  }

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectLoaded(title?: string | RegExp): Promise<void> {
    if (title) await expect(this.page).toHaveTitle(title);
    await expect(this.page.locator('body')).toBeVisible();
  }

  heading(name: string | RegExp): Locator {
    return this.page.getByRole('heading', { name });
  }

  /** Full-page screenshot under test-results/, named <name>.png. */
  async snap(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png`, fullPage: true });
  }

  /** Collect console errors and uncaught page errors; call before goto(). */
  trackErrors(): string[] {
    const errors: string[] = [];
    this.page.on('pageerror', (e) => errors.push(e.message));
    this.page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    return errors;
  }
}
