// tests/form.spec.ts — form validation tests. Replace /signup and the labels with the real ones.
import { test, expect } from '@playwright/test';

test.describe('Signup form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('empty submit is blocked', async ({ page }) => {
    await page.getByRole('button', { name: /sign up|submit/i }).click();
    // Native HTML validation: the required field reports invalid.
    const missing = await page.getByLabel('Email').evaluate((el) => (el as HTMLInputElement).validity.valueMissing);
    expect(missing).toBe(true);
    await expect(page).toHaveURL(/\/signup/);
    await page.screenshot({ path: 'test-results/forms/signup-empty-after.png', fullPage: true });
  });

  for (const bad of ['plainaddress', 'a@', '@b.com', 'a b@c.com']) {
    test(`rejects invalid email "${bad}"`, async ({ page }) => {
      await page.getByLabel('Email').fill(bad);
      await page.getByRole('button', { name: /sign up|submit/i }).click();
      const valid = await page.getByLabel('Email').evaluate((el) => (el as HTMLInputElement).validity.valid);
      expect(valid).toBe(false);
    });
  }

  test('very long and unicode input does not break the page', async ({ page }) => {
    await page.getByLabel('Name').fill('Zoë 名前 '.repeat(100));
    await page.getByRole('button', { name: /sign up|submit/i }).click();
    await expect(page.locator('body')).not.toContainText(/exception|stack trace|500/i);
  });

  test('valid submit shows success', async ({ page }) => {
    await page.getByLabel('Name').fill('Test User');
    await page.getByLabel('Email').fill(`test+${Date.now()}@example.com`);
    await page.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? 'Str0ng!Passw0rd');
    await page.getByRole('button', { name: /sign up|submit/i }).click();
    await expect(page.getByText(/thank you|welcome|check your email/i)).toBeVisible();
    await page.screenshot({ path: 'test-results/forms/signup-valid-after.png', fullPage: true });
  });

  test('server rejects invalid data even without client validation', async ({ request }) => {
    const res = await request.post('/api/signup', { data: { email: 'not-an-email' } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
