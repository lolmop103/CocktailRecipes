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

describe('env — admin and session settings', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('env_productionWithoutAdmin_failsNamingBothVariables', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_USERNAME', undefined);
    vi.stubEnv('ADMIN_PASSWORD_HASH', undefined);

    await expect(loadEnv()).rejects.toThrow(/ADMIN_USERNAME[\s\S]*ADMIN_PASSWORD_HASH/);
  });

  it('env_productionWithAdmin_ok', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { env } = await loadEnv();

    expect(env.ADMIN_USERNAME).toBe('admin');
  });

  it('env_malformedHash_fails', async () => {
    vi.stubEnv('ADMIN_PASSWORD_HASH', 'plaintext-password');

    await expect(loadEnv()).rejects.toThrow(/ADMIN_PASSWORD_HASH/);
  });

  it('env_developmentWithoutAdmin_ok', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_USERNAME', undefined);
    vi.stubEnv('ADMIN_PASSWORD_HASH', undefined);

    const { env } = await loadEnv();

    expect(env.ADMIN_USERNAME).toBeUndefined();
  });

  it('env_sessionTtlDefault_30', async () => {
    vi.stubEnv('SESSION_TTL_DAYS', undefined);

    const { env } = await loadEnv();

    expect(env.SESSION_TTL_DAYS).toBe(30);
  });

  it('env_sessionTtlOf400_fails', async () => {
    vi.stubEnv('SESSION_TTL_DAYS', '400');

    await expect(loadEnv()).rejects.toThrow(/SESSION_TTL_DAYS/);
  });

  it('env_trustProxyHopsDefault_0', async () => {
    vi.stubEnv('TRUST_PROXY_HOPS', undefined);

    const { env } = await loadEnv();

    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });
});

describe('env — CLIENT_ORIGIN', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('env_clientOriginWithSlashAndUppercase_normalisedToOrigin', async () => {
    vi.stubEnv('CLIENT_ORIGIN', 'https://Cocktails.Example.com/');

    const { env } = await loadEnv();

    expect(env.CLIENT_ORIGIN).toBe('https://cocktails.example.com');
  });

  it('env_clientOriginDefaultPort_dropped', async () => {
    vi.stubEnv('CLIENT_ORIGIN', 'https://cocktails.example.com:443');

    const { env } = await loadEnv();

    expect(env.CLIENT_ORIGIN).toBe('https://cocktails.example.com');
  });

  it('env_clientOriginWithPath_fails', async () => {
    vi.stubEnv('CLIENT_ORIGIN', 'https://cocktails.example.com/app');

    await expect(loadEnv()).rejects.toThrow(/CLIENT_ORIGIN/);
  });
});
