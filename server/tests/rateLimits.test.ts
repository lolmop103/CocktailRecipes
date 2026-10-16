import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { adminAgent, TEST_ADMIN, TEST_ORIGIN } from './helpers/admin.js';

const READ_LIMIT = 120;
const WRITE_LIMIT = 60;
const LOGIN_FAILURES = 5;
const MINUTE = 60_000;

/** Sends `count` requests one after another and returns the last response. */
async function repeat(count: number, send: () => Promise<request.Response>) {
  let last: request.Response | undefined;
  for (let i = 0; i < count; i++) last = await send();
  if (last === undefined) throw new Error('no requests sent');
  return last;
}

/** An app that trusts one proxy hop, as behind the owner's Caddy. */
async function appBehindProxy(): Promise<Express> {
  vi.stubEnv('TRUST_PROXY_HOPS', '1');
  vi.resetModules();
  return (await import('../src/app.js')).createApp();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('read limit', () => {
  it('reads_121stInAMinute_429WithRetryAfter', async () => {
    const app = createApp();
    await repeat(READ_LIMIT, () => request(app).get('/api/recipes'));

    const res = await request(app).get('/api/recipes');

    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.body).toMatchObject({
      status: 429,
      message: 'Too many requests — try again in a moment',
    });
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('reads_afterWindow_allowedAgain', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const app = createApp();
    await repeat(READ_LIMIT + 1, () => request(app).get('/api/recipes'));

    vi.setSystemTime(Date.now() + MINUTE + 1);
    const res = await request(app).get('/api/recipes');

    expect(res.status).toBe(200);
  });

  it('health_notLimited', async () => {
    const app = createApp();

    const res = await repeat(READ_LIMIT + 10, () => request(app).get('/api/health'));

    expect(res.status).toBe(200);
  });
});

describe('write limit', () => {
  it('writes_61stInAMinute_429', async () => {
    const app = createApp();
    const admin = await adminAgent(app);
    await repeat(WRITE_LIMIT, () => admin.post('/api/collections').send({ name: 'Batch' }));

    const res = await admin.post('/api/collections').send({ name: 'One too many' });

    expect(res.status).toBe(429);
  });
});

describe('login limit', () => {
  const failLogin = (app: Express) =>
    request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ ...TEST_ADMIN, password: 'wrong-password' });

  it('login_sixthFailure_429', async () => {
    const app = createApp();
    await repeat(LOGIN_FAILURES, () => failLogin(app));

    const res = await failLogin(app);

    expect(res.status).toBe(429);
  });

  it('login_successes_notCounted', async () => {
    const app = createApp();
    await repeat(LOGIN_FAILURES + 1, () =>
      request(app).post('/api/auth/login').set('Origin', TEST_ORIGIN).send(TEST_ADMIN),
    );

    const res = await failLogin(app);

    expect(res.status).toBe(401);
  });
});

describe('client IP behind one proxy', () => {
  it('limits_perIp_twoClientsIndependent', async () => {
    const app = await appBehindProxy();
    await repeat(READ_LIMIT + 1, () =>
      request(app).get('/api/recipes').set('X-Forwarded-For', '203.0.113.1'),
    );

    const other = await request(app).get('/api/recipes').set('X-Forwarded-For', '203.0.113.2');

    expect(other.status).toBe(200);
  });

  it('limits_spoofedLeftmostForwardedFor_stillLimited', async () => {
    const app = await appBehindProxy();
    let i = 0;
    // The client invents the left-most address; Caddy appends the real one.
    const spoofed = () =>
      request(app)
        .get('/api/recipes')
        .set('X-Forwarded-For', `198.51.100.${String(i++ % 250)}, 203.0.113.9`);
    await repeat(READ_LIMIT, spoofed);

    const res = await spoofed();

    expect(res.status).toBe(429);
  });
});

describe('proxy trust', () => {
  it('trustProxy_zeroHops_isFalseSoMisconfigurationIsReported', () => {
    expect(createApp().get('trust proxy')).toBe(false);
  });

  it('trustProxy_oneHop_isOne', async () => {
    const app = await appBehindProxy();

    expect(app.get('trust proxy')).toBe(1);
  });
});

describe('login limit — only wrong credentials count', () => {
  it('login_crossSiteAttempts_doNotLockOutTheAdmin', async () => {
    const app = createApp();
    await repeat(LOGIN_FAILURES + 1, () =>
      request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send(TEST_ADMIN),
    );

    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send(TEST_ADMIN);

    expect(res.status).toBe(204);
  });

  it('login_malformedBodies_doNotCount', async () => {
    const app = createApp();
    await repeat(LOGIN_FAILURES + 1, () =>
      request(app).post('/api/auth/login').set('Origin', TEST_ORIGIN).send({ username: '' }),
    );

    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send(TEST_ADMIN);

    expect(res.status).toBe(204);
  });
});
