import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { sessionStore } from '../src/data/sessionStore.js';
import { authService } from '../src/services/authService.js';
import { env } from '../src/config/env.js';
import { db } from '../src/data/connection.js';
import { adminAgent, TEST_ADMIN } from './helpers/admin.js';
import * as passwordLib from '../src/lib/password.js';
import { loginThrottle } from '../src/lib/loginThrottle.js';
import { UnauthorizedError, TooManyRequestsError } from '../src/lib/errors.js';

const app = createApp();
const ORIGIN = 'http://localhost:5173';
const DAY = 86_400_000;
const login = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/login').set('Origin', ORIGIN).send(body);

beforeEach(() => {
  sessionStore.reset();
});

describe('POST /api/auth/login', () => {
  it('login_correctCredentials_204AndHttpOnlyStrictCookie', async () => {
    const res = await login(TEST_ADMIN);

    expect(res.status).toBe(204);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^cocktail_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
  });

  it('login_wrongPassword_401WithGenericMessage', async () => {
    const res = await login({ ...TEST_ADMIN, password: 'not-the-password' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ message: 'Wrong username or password' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('login_wrongUsername_401SameMessage', async () => {
    const res = await login({ ...TEST_ADMIN, username: 'someone' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ message: 'Wrong username or password' });
  });

  it('login_passwordOf257Chars_400', async () => {
    const res = await login({ ...TEST_ADMIN, password: 'a'.repeat(257) });

    expect(res.status).toBe(400);
  });

  it('login_storesOnlyAHashOfTheToken', async () => {
    const res = await login(TEST_ADMIN);
    const token = /cocktail_session=([^;]+)/.exec(String(res.headers['set-cookie']))?.[1] ?? '';

    const stored = db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.token_hash).not.toBe(token);
    expect(stored[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('login_purgesExpiredSessions', async () => {
    sessionStore.create('stale', 'any-tag', 1, 2);

    await login(TEST_ADMIN);

    expect(sessionStore.purgeExpired(3)).toBe(0);
  });
});

describe('GET /api/auth/me and logout', () => {
  it('me_withoutCookie_unauthenticated', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.body).toEqual({ authenticated: false });
  });

  it('me_afterLogin_authenticatedWithUsername', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/auth/me');

    expect(res.body).toEqual({ authenticated: true, username: 'admin' });
  });

  it('me_noStoreHeader', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('logout_afterLogin_meUnauthenticated', async () => {
    const agent = await adminAgent(app);

    const out = await agent.post('/api/auth/logout').set('Origin', ORIGIN);
    const me = await agent.get('/api/auth/me');

    expect(out.status).toBe(204);
    expect(me.body).toEqual({ authenticated: false });
  });

  it('logout_withoutSession_204', async () => {
    const res = await request(app).post('/api/auth/logout').set('Origin', ORIGIN);

    expect(res.status).toBe(204);
  });

  it('session_expired_meUnauthenticated', async () => {
    const { token } = await authService.login(
      TEST_ADMIN.username,
      TEST_ADMIN.password,
      Date.now() - 31 * DAY,
    );

    const res = await request(app).get('/api/auth/me').set('Cookie', `cocktail_session=${token}`);

    expect(res.body).toEqual({ authenticated: false });
  });
});

describe('login without admin configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('login_unconfigured_503', async () => {
    vi.stubEnv('ADMIN_USERNAME', undefined);
    vi.stubEnv('ADMIN_PASSWORD_HASH', undefined);
    vi.resetModules();
    const fresh = (await import('../src/app.js')).createApp();

    const res = await request(fresh).post('/api/auth/login').set('Origin', ORIGIN).send(TEST_ADMIN);

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ message: 'Admin login is not configured' });
  });
});

describe('session revocation', () => {
  const tokenFrom = (res: { headers: Record<string, unknown> }) =>
    /cocktail_session=([^;]+)/.exec(String(res.headers['set-cookie']))?.[1] ?? '';
  const meWith = (token: string) =>
    request(app).get('/api/auth/me').set('Cookie', `cocktail_session=${token}`);

  it('logout_revokesTheTokenServerSide', async () => {
    const token = tokenFrom(await login(TEST_ADMIN));

    await request(app)
      .post('/api/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', `cocktail_session=${token}`);

    // The token is sent explicitly: a client that kept the cookie must be refused.
    expect((await meWith(token)).body).toEqual({ authenticated: false });
  });

  it('passwordChange_endsExistingSessions', async () => {
    const token = tokenFrom(await login(TEST_ADMIN));
    const original = env.ADMIN_PASSWORD_HASH;

    env.ADMIN_PASSWORD_HASH = 'scrypt$1024$8$1$bmV3LXNhbHQ=$bmV3LWtleQ==';
    const after = await meWith(token);
    env.ADMIN_PASSWORD_HASH = original;

    expect(after.body).toEqual({ authenticated: false });
  });
});

const WRONG = { ...TEST_ADMIN, password: 'not-the-password' };

describe('login throttle over HTTP', () => {
  // A fresh app per test keeps the per-IP limiter (removed in Task 3) out of the way.
  let fresh = createApp();
  const login = (body: Record<string, unknown>, origin = ORIGIN) =>
    request(fresh).post('/api/auth/login').set('Origin', origin).send(body);

  beforeEach(() => {
    fresh = createApp();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('login_afterThreeWrong_fourthRefusedWith429EvenWithCorrectPassword', async () => {
    for (let i = 0; i < 3; i += 1) expect((await login(WRONG)).status).toBe(401);

    const res = await login(TEST_ADMIN);

    expect(res.status).toBe(429);
    expect(res.body.status).toBe(429);
    expect(typeof res.body.message).toBe('string');
    const seconds = res.body.retryAfterSeconds as number;
    expect(Number.isInteger(seconds)).toBe(true);
    expect(seconds).toBeGreaterThanOrEqual(1);
    expect(seconds).toBeLessThanOrEqual(30);
    expect(res.headers['retry-after']).toBe(String(seconds));
    expect(Buffer.byteLength(res.text)).toBeLessThanOrEqual(200);
    expect((await login(TEST_ADMIN)).status).toBe(429);
  });

  it('login_400And403_doNotCountTowardTheThrottle', async () => {
    for (let i = 0; i < 2; i += 1) expect((await login(WRONG)).status).toBe(401);
    for (let i = 0; i < 5; i += 1) {
      expect((await login({ username: '' })).status).toBe(400);
      expect((await login(WRONG, 'http://evil.example')).status).toBe(403);
    }

    expect((await login(WRONG)).status).toBe(401);
    expect((await login(TEST_ADMIN)).status).toBe(429);
  });

  it('login_correctOnThirdAttempt_resetsTheCount', async () => {
    for (let i = 0; i < 2; i += 1) await login(WRONG);
    expect((await login(TEST_ADMIN)).status).toBe(204);

    for (let i = 0; i < 3; i += 1) expect((await login(WRONG)).status).toBe(401);
  });

  it('login_afterTheCooldown_correctPasswordGives204', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 3; i += 1) await login(WRONG);
    expect((await login(TEST_ADMIN)).status).toBe(429);

    vi.setSystemTime(new Date('2026-01-01T00:00:31Z'));

    expect((await login(TEST_ADMIN)).status).toBe(204);
  });
});

describe('authService.login throttle', () => {
  const verify = vi.spyOn(passwordLib, 'verifyPassword');

  beforeEach(() => {
    verify.mockClear();
  });

  async function messageOf(username: string, password: string): Promise<string> {
    try {
      await authService.login(username, password);
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      return (err as Error).message;
    }
    throw new Error('expected a rejection');
  }

  it('login_wrongUsernamePasswordOrBoth_eachVerifyOnceWithIdenticalMessage', async () => {
    const messages: string[] = [];
    for (const [u, p] of [
      ['someone', TEST_ADMIN.password],
      [TEST_ADMIN.username, 'nope'],
      ['someone', 'nope'],
    ] as const) {
      verify.mockClear();
      messages.push(await messageOf(u, p));
      expect(verify).toHaveBeenCalledTimes(1);
      loginThrottle.reset();
    }

    expect(new Set(messages)).toEqual(new Set(['Wrong username or password']));
  });

  it('login_100Parallel_atMostThreeReachVerify', async () => {
    const now = Date.now();
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () => authService.login('x', 'y', now)),
    );

    expect(verify.mock.calls.length).toBeLessThanOrEqual(3);
    const refused = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof TooManyRequestsError,
    );
    expect(refused).toHaveLength(97);
  });

  it('login_refused_verifyNeverRuns', async () => {
    const now = Date.now();
    for (let i = 0; i < 3; i += 1) await authService.login('x', 'y', now).catch(() => undefined);
    verify.mockClear();

    await expect(
      authService.login(TEST_ADMIN.username, TEST_ADMIN.password, now),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(verify).not.toHaveBeenCalled();
  });
});
