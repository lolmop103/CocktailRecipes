import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../src/app.js';
import { adminAgent, TEST_ADMIN, TEST_ORIGIN } from './helpers/admin.js';

const app = createApp();

/** All nine routes that change data (spec §3, requireAdmin). */
const WRITES = [
  ['post', '/api/recipes'],
  ['patch', '/api/recipes/1'],
  ['patch', '/api/recipes/1/rating'],
  ['delete', '/api/recipes/1'],
  ['post', '/api/collections'],
  ['post', '/api/collections/1/recipes/1'],
  ['delete', '/api/collections/1/recipes/1'],
  ['delete', '/api/collections/1'],
  ['patch', '/api/ingredients/gin'],
] as const;

let admin: TestAgent;
/** A valid admin session cookie, to send without an Origin header. */
let sessionCookie: string;

beforeAll(async () => {
  admin = await adminAgent(app);
  const login = await request(app)
    .post('/api/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send(TEST_ADMIN);
  sessionCookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
});

describe('write guards', () => {
  it.each(WRITES)('%s %s_noSession_401', async (method, path) => {
    const res = await request(app)[method](path).set('Origin', TEST_ORIGIN).send({});

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ message: 'Log in to make changes' });
  });

  it.each(WRITES)('%s %s_foreignOrigin_403', async (method, path) => {
    const res = await admin[method](path).set('Origin', 'https://evil.example').send({});

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ message: 'Cross-site request refused' });
  });

  it.each(WRITES)('%s %s_missingOrigin_403', async (method, path) => {
    const res = await request(app)[method](path).set('Cookie', sessionCookie).send({});

    expect(res.status).toBe(403);
  });

  it.each(WRITES)('%s %s_adminSession_notGuarded', async (method, path) => {
    const res = await admin[method](path).send({});

    expect([401, 403]).not.toContain(res.status);
  });

  it('login_foreignOrigin_403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send(TEST_ADMIN);

    expect(res.status).toBe(403);
  });

  it('getRecipes_noSession_200', async () => {
    const res = await request(app).get('/api/recipes');

    expect(res.status).toBe(200);
  });
});
