import { test, expect, devices } from '@playwright/test';

// The iPhone preset defaults to WebKit; only Chromium is installed in CI, and
// the layout questions here (overflow, reachability) do not depend on the engine.
test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

test('the recipe list fits a phone screen without horizontal scrolling', async ({ page }) => {
  await page.goto('/cocktails');
  await expect(page.getByRole('heading', { level: 3, name: 'Mojito' })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport);

  // The controls a phone user needs first are all reachable.
  await expect(page.getByRole('tab', { name: /Cocktails/ })).toBeVisible();
  await expect(page.getByLabel('Search by name')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ New Recipe' })).toBeVisible();

  if (process.env['UPDATE_SCREENSHOTS']) {
    await page.screenshot({ path: 'docs/screenshot-mobile.png', fullPage: false });
  }
});
