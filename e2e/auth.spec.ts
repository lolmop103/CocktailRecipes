import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/login.js';

test('the admin logs in, creates a recipe, logs out and can no longer edit', async ({ page }) => {
  await page.goto('/cocktails');
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ New Recipe' })).toHaveCount(0);

  await loginAsAdmin(page);
  await page.goto('/cocktails');
  await page.getByRole('button', { name: '+ New Recipe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add new recipe' });
  await dialog.getByLabel('Name *').fill('Admin Sour');
  await dialog.getByRole('combobox', { name: 'Ingredient 1 name' }).fill('gin');
  await dialog.getByRole('button', { name: 'Create Recipe' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 3, name: 'Admin Sour' })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();

  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Rate / })).toHaveCount(0);
});

test('a write without login is refused', async ({ request, baseURL }) => {
  const res = await request.post('/api/recipes', {
    headers: { Origin: baseURL ?? '' },
    data: { name: 'Sneaky', ingredients: [{ name: 'gin' }] },
  });

  expect(res.status()).toBe(401);
});
