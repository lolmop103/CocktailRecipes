import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * End-to-end tests drive the production build — Express serving the built
 * client on one port, exactly as the Docker image runs — against a fresh,
 * freshly seeded SQLite database in a temp directory. Nothing touches the
 * developer's own data-store.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${String(PORT)}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Tests write to one shared database; a single worker keeps them ordered.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && node server/dist/index.js',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      CLIENT_ORIGIN: BASE_URL,
      DATA_DIR: join(tmpdir(), `cocktail-e2e-${String(process.pid)}`),
      LOG_LEVEL: 'warn',
    },
  },
});
