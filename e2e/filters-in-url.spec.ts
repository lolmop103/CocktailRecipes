import { test, expect } from '@playwright/test';

test('an ingredient filter in the URL is applied and survives a reload', async ({ page }) => {
  await page.goto('/cocktails?ingredients=bourbon');

  await expect(page.locator('.result-count')).toHaveText('1 recipe');
  await expect(page.getByRole('heading', { level: 3, name: 'Whiskey Sour' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Mojito' })).toBeHidden();
  await expect(page.getByRole('list', { name: 'Selected ingredients' })).toContainText('bourbon');

  await page.reload();

  await expect(page.locator('.result-count')).toHaveText('1 recipe');
  await expect(page.getByRole('heading', { level: 3, name: 'Whiskey Sour' })).toBeVisible();
});

test('typing in the search box writes the query string, so the view is linkable', async ({
  page,
}) => {
  await page.goto('/cocktails');

  await page.getByLabel('Search by name').fill('negro');

  await expect(page).toHaveURL(/\?q=negro$/);
  await expect(page.locator('.result-count')).toHaveText('1 recipe');
  await expect(page.getByRole('heading', { level: 3, name: 'Negroni' })).toBeVisible();

  // Picking an ingredient from the combobox lands in the URL too.
  const combobox = page.getByRole('combobox', { name: 'Search ingredients' });
  await combobox.fill('rum');
  await page.getByRole('option', { name: 'white rum' }).click();

  await expect(page).toHaveURL(/ingredients=white\+rum/);
});
