import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import type { Express } from 'express';

/**
 * Test-only admin credentials. The hash uses a deliberately low scrypt cost
 * (N=1024) so logins in tests are fast; production hashes come from
 * `pnpm --filter cocktail-server hash-password` with the full cost. Never use these anywhere else.
 */
export const TEST_ADMIN = { username: 'admin', password: 'test-admin-password' } as const;

export const TEST_ADMIN_PASSWORD_HASH =
  'scrypt$1024$8$1$Y29ja3RhaWwtdGVzdC1zYWx0$SrCe7cQgqgEmwhEu4/R56wDLexjTLseaW2nJIWA78e0qu6feX2AcMaLgvRY6NqW4Mi2PMw9HRvKPTN9lYuaIQA==';

/** The browser origin the API accepts writes from in tests (CLIENT_ORIGIN's default). */
export const TEST_ORIGIN = 'http://localhost:5173';

/**
 * A supertest agent logged in as the test admin: it keeps the session cookie
 * and sends the allowed Origin on every request, as the browser app does.
 */
export async function adminAgent(app: Express): Promise<TestAgent> {
  const agent = request.agent(app).set('Origin', TEST_ORIGIN);
  const res = await agent.post('/api/auth/login').set('Origin', TEST_ORIGIN).send(TEST_ADMIN);
  if (res.status !== 204) throw new Error(`test admin login failed: ${String(res.status)}`);
  return agent;
}
