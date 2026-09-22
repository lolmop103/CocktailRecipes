import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * env.ts validates once at import time, so each case resets the module
 * registry and imports it fresh under a stubbed process.env.
 */
async function loadEnv() {
  vi.resetModules();
  return import('../src/config/env.js');
}

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('appliesDefaults_whenVariablesAreAbsent', async () => {
    vi.stubEnv('PORT', undefined);
    vi.stubEnv('CLIENT_ORIGIN', undefined);
    vi.stubEnv('LOG_LEVEL', undefined);

    const { env } = await loadEnv();

    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(3000);
    expect(env.CLIENT_ORIGIN).toBe('http://localhost:5173');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coercesPort_fromString', async () => {
    vi.stubEnv('PORT', '4321');

    const { env } = await loadEnv();

    expect(env.PORT).toBe(4321);
  });

  it('failsFast_namingTheOffendingVariables', async () => {
    vi.stubEnv('PORT', 'not-a-port');
    vi.stubEnv('LOG_LEVEL', 'shouting');

    await expect(loadEnv()).rejects.toThrow(
      /Invalid environment configuration:[\s\S]*PORT[\s\S]*LOG_LEVEL/,
    );
  });
});
