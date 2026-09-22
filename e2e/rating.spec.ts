import { test, expect } from '@playwright/test';

test('rating a recipe persists across a reload', async ({ page }) => {
  await page.goto('/cocktails');

  // Espresso Martini ships unrated.
  const fourStars = page.getByRole('button', { name: 'Rate Espresso Martini 4 stars' });
  await expect(fourStars).toHaveAttribute('aria-pressed', 'false');

  await fourStars.click();
  await expect(fourStars).toHaveAttribute('aria-pressed', 'true');

  await page.reload();

  await expect(page.getByRole('button', { name: 'Rate Espresso Martini 4 stars' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Rate Espresso Martini 5 stars' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
