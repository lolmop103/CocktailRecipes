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

describe('production boot', () => {
  const originalCwd = process.cwd();
  const root = mkdtempSync(join(tmpdir(), 'cocktail-prod-'));
  let app: Express;
  let closeDb: () => void = () => undefined;

  beforeAll(async () => {
    mkdirSync(join(root, 'client', 'dist'), { recursive: true });
    writeFileSync(join(root, 'client', 'dist', 'index.html'), INDEX_HTML);
    process.chdir(root);

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATA_DIR', join(root, 'data'));
    vi.stubEnv('CLIENT_ORIGIN', 'http://localhost:3000');
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

  it('createsTheDataDirectory_andSeedsTheDatabase', async () => {
    expect(existsSync(join(root, 'data', 'cocktail.db'))).toBe(true);

    const res = await request(app).get('/api/recipes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
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
});
