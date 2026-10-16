import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Test-only credentials; playwright.config.ts gives the e2e server their hash. */
export const TEST_ADMIN = { username: 'admin', password: 'test-admin-password' } as const;

/** Logs in through the login page, as the owner would. */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(TEST_ADMIN.username);
  await page.getByLabel('Password').fill(TEST_ADMIN.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
}

/**
 * Headers for API calls made as the admin outside the browser: the site's
 * Origin and the session cookie, set explicitly because the production cookie
 * is Secure and the e2e server runs on plain-HTTP localhost.
 */
export async function adminHeaders(
  request: APIRequestContext,
  baseURL: string,
): Promise<Record<string, string>> {
  const res = await request.post('/api/auth/login', {
    headers: { Origin: baseURL },
    data: TEST_ADMIN,
  });
  expect(res.status()).toBe(204);
  const cookie = (res.headers()['set-cookie'] ?? '').split(';')[0] ?? '';
  return { Origin: baseURL, Cookie: cookie };
}
