// tests/api.spec.ts — API tests with Playwright's `request` fixture (https://playwright.dev/docs/api-testing)
// Uses baseURL from playwright.config.ts. Replace /api/items with real endpoints.
import { test, expect } from '@playwright/test';

const auth: Record<string, string> = process.env.API_TOKEN ? { Authorization: `Bearer ${process.env.API_TOKEN}` } : {};

test.describe('API /api/items', () => {
  let createdId: string | number | undefined;

  test('GET list returns 200 and an array', async ({ request }) => {
    const res = await request.get('/api/items', { headers: auth });
    await expect(res).toBeOK();
    expect(res.headers()['content-type']).toContain('application/json');
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST creates an item', async ({ request }) => {
    const name = `test-${Date.now()}`;
    const res = await request.post('/api/items', { headers: auth, data: { name } });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({ name }));
    createdId = body.id;
  });

  test('POST with invalid body is rejected', async ({ request }) => {
    const res = await request.post('/api/items', { headers: auth, data: { name: '' } });
    expect([400, 422]).toContain(res.status());
  });

  test('without auth is rejected', async ({ request }) => {
    test.skip(!process.env.API_TOKEN, 'endpoint is public');
    const res = await request.get('/api/items');
    expect([401, 403]).toContain(res.status());
  });

  test('unknown id returns 404', async ({ request }) => {
    const res = await request.get('/api/items/does-not-exist', { headers: auth });
    expect(res.status()).toBe(404);
  });

  test('responds within 1 second', async ({ request }) => {
    const start = Date.now();
    const res = await request.get('/api/items', { headers: auth });
    expect(res.ok()).toBe(true);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test.afterAll(async ({ request }) => {
    if (createdId !== undefined) await request.delete(`/api/items/${createdId}`, { headers: auth });
  });
});
