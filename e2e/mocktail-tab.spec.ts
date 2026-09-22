import { test, expect } from '@playwright/test';

test('the mocktail tab hides alcoholic ingredients from the picker', async ({ page }) => {
  await page.goto('/cocktails');

  const combobox = page.getByRole('combobox', { name: 'Search ingredients' });
  await combobox.click();
  await expect(page.getByRole('option', { name: 'gin', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'fresh lime juice' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: /Mocktails/ }).click();

  await expect(page).toHaveURL(/\/mocktails$/);
  await expect(page.getByRole('tab', { name: /Mocktails/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await combobox.click();
  await expect(page.getByRole('option', { name: 'fresh lime juice' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'gin', exact: true })).toHaveCount(0);

  // The seed ships no mocktails, so the grid says so rather than going blank.
  await expect(page.getByText('No recipes match your filters.')).toBeVisible();
});
