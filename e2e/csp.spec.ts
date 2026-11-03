import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/login.js';

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

test('the app loads under the CSP and talks only to its own origin', async ({ page, baseURL }) => {
  const requests: string[] = [];
  const violations: string[] = [];
  page.on('request', (req) => {
    if (/^https?:/.test(req.url())) requests.push(req.url());
  });
  page.on('console', (msg) => {
    if (msg.text().includes('Content Security Policy')) violations.push(msg.text());
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  await page.goto('/cocktails');
  await expect(page.getByRole('heading', { level: 3, name: 'Mojito' })).toBeVisible();

  // Rendering each select exercises the data-URI chevron.
  const selects = page.locator('.filter-group select');
  for (let i = 0; i < (await selects.count()); i++) {
    const select = selects.nth(i);
    const first = await select.locator('option').first().getAttribute('value');
    if (first === null) await select.focus();
    else await select.selectOption(first);
  }

  await loginAsAdmin(page);
  await page.goto('/cocktails');
  await page.getByRole('button', { name: '+ New Recipe' }).click();
  await expect(page.getByRole('dialog', { name: 'Add new recipe' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.waitForLoadState('networkidle');

  const origin = new URL(baseURL ?? '').origin;
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.map((url) => new URL(url).origin).filter((o) => o !== origin)).toEqual([]);
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

test('robots.txt is plain text that keeps crawlers off the API', async ({ page }) => {
  const res = await page.request.get('/robots.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^text\/plain/);
  expect(await res.text()).toContain('Disallow: /api/');
});
