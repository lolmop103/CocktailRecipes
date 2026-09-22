import { test, expect } from '@playwright/test';

test('a new recipe appears in the grid after saving', async ({ page }) => {
  await page.goto('/cocktails');
  const count = page.locator('.result-count');
  await expect(count).toContainText(/\d+ recipes?/);
  const before = Number((await count.textContent())?.match(/\d+/)?.[0]);

  await page.getByRole('button', { name: '+ New Recipe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add new recipe' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Name *').fill('Gin Fizz');
  // Both ingredients are already classified, so no follow-up dialog appears.
  await dialog.getByRole('combobox', { name: 'Ingredient 1 name' }).fill('gin');
  await dialog.getByLabel('Ingredient 1 amount').fill('50');
  await dialog.getByRole('button', { name: '+ Add ingredient' }).click();
  await dialog.getByRole('combobox', { name: 'Ingredient 2 name' }).fill('fresh lemon juice');
  await dialog.getByLabel('Ingredient 2 amount').fill('25');
  await dialog.getByLabel('Glass type').selectOption('highball');
  await dialog.getByRole('button', { name: 'Create Recipe' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 3, name: 'Gin Fizz' })).toBeVisible();
  await expect(count).toHaveText(`${String(before + 1)} recipes`);
});
