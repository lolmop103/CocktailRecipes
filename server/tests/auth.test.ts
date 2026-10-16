import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { sessionStore } from '../src/data/sessionStore.js';
import { authService } from '../src/services/authService.js';
import { env } from '../src/config/env.js';
import { db } from '../src/data/connection.js';
import { adminAgent, TEST_ADMIN } from './helpers/admin.js';

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
