import { test, expect } from '@playwright/test';

/**
 * Enough extra cocktails for three pages of 24. Kept at 41 so the whole e2e
 * run stays under the API's write limit of 60 per minute.
 */
const EXTRA_RECIPES = 41;

test.beforeAll(async ({ request }) => {
  for (let i = 0; i < EXTRA_RECIPES; i++) {
    // "Zz" sorts these after every recipe the other journeys look for.
    const res = await request.post('/api/recipes', {
      data: {
        name: `Zz Scroll ${String(i).padStart(2, '0')}`,
        ingredients: [{ name: 'gin', amount: '50ml' }],
        isMocktail: false,
      },
    });
    expect(res.status()).toBe(201);
  }
});

test('scrolling to the end shows every recipe once', async ({ page }) => {
  await page.goto('/cocktails?sortBy=name');
  const count = page.locator('.result-count');
  await expect(count).toContainText(/Showing 24 of \d+ recipes/);
  const total = Number((await count.textContent())?.match(/of (\d+)/)?.[1]);
  expect(total).toBeGreaterThan(48);

  const showMore = page.getByRole('button', { name: 'Show more' });
  while (await showMore.isVisible()) {
    // Listen before scrolling: a fast response could otherwise arrive first.
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/recipes')),
      showMore.scrollIntoViewIfNeeded(),
    ]);
  }

  await expect(count).toHaveText(`Showing ${String(total)} of ${String(total)} recipes`);
  const names = await page.getByRole('heading', { level: 3 }).allTextContents();
  expect(names).toHaveLength(total);
  expect(new Set(names).size).toBe(total);
});
