// tests/pages/HomePage.ts — one page object per page. Locators are fields, user actions are methods.
// Rename and replace the example locators with the real ones from browser_snapshot.
import { type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  readonly searchBox: Locator;
  readonly searchButton: Locator;
  readonly results: Locator;
  readonly navLinks: Locator;

  constructor(page: Page) {
    super(page, '/');
    this.searchBox = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first();
    this.searchButton = page.getByRole('button', { name: /search/i });
    this.results = page.getByTestId('search-results');
    this.navLinks = page.getByRole('navigation').getByRole('link');
  }

  async search(term: string): Promise<void> {
    await this.searchBox.fill(term);
    await this.searchButton.click();
  }

  async openNav(name: string | RegExp): Promise<void> {
    await this.navLinks.filter({ hasText: name }).first().click();
  }
}
