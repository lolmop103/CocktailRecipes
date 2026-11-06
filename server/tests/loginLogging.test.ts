import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { authService } from '../src/services/authService.js';
import { TooManyRequestsError, UnauthorizedError } from '../src/lib/errors.js';
import { logger } from '../src/lib/logger.js';
import { TEST_ADMIN, TEST_ORIGIN } from './helpers/admin.js';

const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
const USER = 'probe-user-7';
const PASS = 'probe-pass-7';
/** Runs one login and tolerates only the expected refusals (401 wrong, 429 cooldown). */
async function attempt(u: string, p: string, now: number): Promise<void> {
  try {
    await authService.login(u, p, now);
  } catch (err) {
    if (!(err instanceof UnauthorizedError || err instanceof TooManyRequestsError)) throw err;
  }
}
const linesOf = (message: string) => warn.mock.calls.filter(([m]) => m === message);

afterEach(() => {
  warn.mockClear();
});

describe('failed-login logging', () => {
  it('login_wrongCredentials_logsCountsOnly', async () => {
    await attempt(USER, PASS, 1000);

    expect(warn).toHaveBeenCalledWith('Login failed', {
      consecutiveFailures: 1,
      cooldownSeconds: 0,
    });
    const text = JSON.stringify(warn.mock.calls);
    for (const secret of [USER, PASS, '::ffff', '127.0.0.1']) expect(text).not.toContain(secret);
  });

  it('login_wrongUsernameOrWrongPassword_identicalLines', async () => {
    await attempt(USER, TEST_ADMIN.password, 1000);
    await attempt(TEST_ADMIN.username, PASS, 2000);

    expect(warn.mock.calls).toEqual([
      ['Login failed', { consecutiveFailures: 1, cooldownSeconds: 0 }],
      ['Login failed', { consecutiveFailures: 2, cooldownSeconds: 0 }],
    ]);
  });

  it('login_fiveRefusalsInOneWindow_oneRefusalLine', async () => {
    for (let i = 0; i < 3; i += 1) await attempt(USER, PASS, 1000);
    warn.mockClear();

    for (let i = 0; i < 5; i += 1) await attempt(USER, PASS, 2000 + i);

    expect(linesOf('Login refused during cooldown')).toEqual([
      ['Login refused during cooldown', { retryAfterSeconds: expect.any(Number) }],
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('login_success_logsNothing', async () => {
    await authService.login(TEST_ADMIN.username, TEST_ADMIN.password, 1000);

    expect(warn).not.toHaveBeenCalled();
  });

  it('login_wrongCredentialsOverHttp_noLogOutputHoldsPersonalData', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const res = await request(createApp())
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ username: USER, password: PASS });

    expect(res.status).toBe(401);
    const text = JSON.stringify([
      warn.mock.calls,
      error.mock.calls,
      consoleError.mock.calls,
      consoleLog.mock.calls,
    ]);
    expect(text).toContain('Login failed');
    for (const secret of [USER, PASS, '::ffff', '127.0.0.1']) expect(text).not.toContain(secret);
    error.mockRestore();
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });
});
