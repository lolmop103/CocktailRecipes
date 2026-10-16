import { test, expect, devices, type Page } from '@playwright/test';
import { loginAsAdmin } from './helpers/login.js';

// The iPhone preset defaults to WebKit; only Chromium is installed in CI, and
// the layout questions here (overflow, reachability) do not depend on the engine.
test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' });

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport);
}

test('the recipe list fits a phone screen without horizontal scrolling', async ({ page }) => {
  await page.goto('/cocktails');
  await expect(page.getByRole('heading', { level: 3, name: 'Mojito' })).toBeVisible();
  await expectNoSidewaysScroll(page);

  // The controls a phone visitor needs first are all reachable.
  await expect(page.getByRole('tab', { name: /Cocktails/ })).toBeVisible();
  await expect(page.getByLabel('Search by name')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

  // And the admin's primary action, once logged in.
  await loginAsAdmin(page);
  await page.goto('/cocktails');
  await expect(page.getByRole('button', { name: '+ New Recipe' })).toBeVisible();
  await expectNoSidewaysScroll(page);

  if (process.env['UPDATE_SCREENSHOTS']) {
    await page.screenshot({ path: 'docs/screenshot-mobile.png', fullPage: false });
  }
});
