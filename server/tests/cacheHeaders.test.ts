import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { applyServerTimeouts } from '../src/lib/serverTimeouts.js';

const app = createApp();

describe('API cache headers', () => {
  it('apiGet_noCache', async () => {
    const res = await request(app).get('/api/recipes');

    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('authMe_noStore', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('apiGet_repeatWithEtag_304', async () => {
    const first = await request(app).get('/api/ingredients');

    const second = await request(app)
      .get('/api/ingredients')
      .set('If-None-Match', first.headers['etag'] as string);

    expect(second.status).toBe(304);
  });
});

describe('server timeouts', () => {
  it('applyServerTimeouts_setsBothValues', () => {
    const server = createServer();

    applyServerTimeouts(server);

    expect(server.headersTimeout).toBe(10_000);
    expect(server.requestTimeout).toBe(30_000);
  });
});
