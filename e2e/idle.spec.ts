import { test, expect } from '@playwright/test';

const IDLE_MS = 5_000;

test('an open list makes no requests while idle', async ({ page }) => {
  await page.goto('/cocktails');
  await expect(page.locator('.result-count')).toContainText('Showing');
  await page.waitForLoadState('networkidle');

  const apiRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/')) apiRequests.push(req.url());
  });
  await page.waitForTimeout(IDLE_MS);

  expect(apiRequests).toEqual([]);
});
