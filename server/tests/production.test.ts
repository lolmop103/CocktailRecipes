/**
 * Boots the app the way the Docker image does — NODE_ENV=production, a real
 * SQLite file under DATA_DIR, and a built client on disk — to prove the SPA
 * fallback and the JSON 404 for unknown API routes both hold. Express 5
 * changed wildcard route syntax, so this is not a hypothetical.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';

const INDEX_HTML = '<!doctype html><title>cocktail production shell</title>';
const ROBOTS_TXT = 'User-agent: *\nDisallow: /api/\n';

function parseCsp(header: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of header.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives[name] = values;
  }
  return directives;
}

describe('production boot', () => {
  const originalCwd = process.cwd();
  const root = mkdtempSync(join(tmpdir(), 'cocktail-prod-'));
  let app: Express;
  let closeDb: () => void = () => undefined;

  beforeAll(async () => {
    mkdirSync(join(root, 'client', 'dist'), { recursive: true });
    writeFileSync(join(root, 'client', 'dist', 'index.html'), INDEX_HTML);
    writeFileSync(join(root, 'client', 'dist', 'robots.txt'), ROBOTS_TXT);
    mkdirSync(join(root, 'client', 'dist', 'assets'), { recursive: true });
    writeFileSync(join(root, 'client', 'dist', 'assets', 'app-abc123.js'), 'console.log(1);');
    process.chdir(root);

    vi.stubEnv('NODE_ENV', 'production');
    // The cheap test-only hash from vitest.config.ts.
    vi.stubEnv('ALLOW_WEAK_ADMIN_HASH', 'true');
    vi.stubEnv('DATA_DIR', join(root, 'data'));
    vi.stubEnv('CLIENT_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('TRUST_PROXY_HOPS', '0');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.resetModules();

    const mod = await import('../src/app.js');
    app = mod.createApp();
    // Same module registry as the app, so this is the handle it opened. It has
    // to be closed before the directory can be deleted on Windows.
    const { db } = await import('../src/data/connection.js');
    closeDb = () => db.close();
  });

  afterAll(() => {
    closeDb();
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('assetFile_immutableOneYear', async () => {
    const res = await request(app).get('/assets/app-abc123.js');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('indexHtml_noCache', async () => {
    const res = await request(app).get('/');

    expect(res.text).toBe(INDEX_HTML);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('spaFallback_noCache', async () => {
    const res = await request(app).get('/mocktails');

    expect(res.text).toBe(INDEX_HTML);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('createsTheDataDirectory_andSeedsTheDatabase', async () => {
    expect(existsSync(join(root, 'data', 'cocktail.db'))).toBe(true);

    const res = await request(app).get('/api/recipes');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(8);
  });

  it('servesTheClientShell_forDeepLinks', async () => {
    const res = await request(app).get('/mocktails?ingredients=gin');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toBe(INDEX_HTML);
  });

  it('answersUnknownApiRoutes_withJson404_notTheShell', async () => {
    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404 });
  });

  it('csp_directives_matchPolicy', async () => {
    const res = await request(app).get('/');
    const csp = parseCsp(res.headers['content-security-policy'] as string);

    expect(csp).toMatchObject({
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'font-src': ["'self'"],
      'img-src': ["'self'", 'data:'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'"],
      'script-src-attr': ["'none'"],
    });
    expect(csp).toHaveProperty('upgrade-insecure-requests');
    expect(csp['upgrade-insecure-requests']).toEqual([]);
  });

  it('csp_noValueLoosens', async () => {
    const res = await request(app).get('/');
    const csp = parseCsp(res.headers['content-security-policy'] as string);

    const all = Object.values(csp).flat();
    expect(all.join(' ')).not.toMatch(/https:|http:|'unsafe-inline'|'unsafe-eval'/);
    expect(all).not.toContain('*');
    for (const [name, values] of Object.entries(csp)) {
      if (name !== 'img-src') expect(values).not.toContain('data:');
    }
  });

  it('robotsTxt_served_asText', async () => {
    const res = await request(app).get('/robots.txt');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toContain('Disallow: /api/');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('unknownPath_stillServesIndex', async () => {
    const res = await request(app).get('/no-such-page');

    expect(res.text).toBe(INDEX_HTML);
  });
});
