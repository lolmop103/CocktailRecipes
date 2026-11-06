import { describe, it, expect, vi, afterEach } from 'vitest';
import { hashPassword } from '../src/lib/password.js';

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
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    vi.stubEnv('CLIENT_ORIGIN', 'https://cocktails.example.com');
    vi.stubEnv('ADMIN_PASSWORD_HASH', await hashPassword('a-real-password'));

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

  it('env_sessionTtlDefault_14', async () => {
    vi.stubEnv('SESSION_TTL_DAYS', undefined);

    const { env } = await loadEnv();

    expect(env.SESSION_TTL_DAYS).toBe(14);
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

describe('env — admin hash strength', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('env_productionWithTestHash_failsAsTooCheap', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_WEAK_ADMIN_HASH', undefined);

    await expect(loadEnv()).rejects.toThrow(/ADMIN_PASSWORD_HASH: .*too cheap/);
  });

  it('env_productionWithTestHashAndAllowWeak_ok', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    vi.stubEnv('CLIENT_ORIGIN', 'https://cocktails.example.com');
    vi.stubEnv('ALLOW_WEAK_ADMIN_HASH', 'true');

    const { env } = await loadEnv();

    expect(env.ALLOW_WEAK_ADMIN_HASH).toBe(true);
  });

  it('env_allowWeakOtherThanTrueOrFalse_fails', async () => {
    vi.stubEnv('ALLOW_WEAK_ADMIN_HASH', 'yes');

    await expect(loadEnv()).rejects.toThrow(/ALLOW_WEAK_ADMIN_HASH/);
  });

  it('env_unusableHash_failsEvenOutsideProduction', async () => {
    vi.stubEnv('ADMIN_PASSWORD_HASH', 'scrypt$1048576$8$1$AA==$AA==');

    await expect(loadEnv()).rejects.toThrow(/ADMIN_PASSWORD_HASH: .*cannot be verified/);
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

describe('env — production proxy settings', () => {
  const HOPS_MESSAGE =
    /TRUST_PROXY_HOPS: is required in production \(0 = no proxy, 1 = Caddy, 2 = Cloudflare and Caddy\)/;
  const HTTPS_MESSAGE =
    /CLIENT_ORIGIN: must be https:\/\/ in production \(http:\/\/ is allowed only for localhost\)/;

  function production(hops: string | undefined, origin: string | undefined) {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_WEAK_ADMIN_HASH', 'true');
    vi.stubEnv('TRUST_PROXY_HOPS', hops);
    vi.stubEnv('CLIENT_ORIGIN', origin);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('env_productionWithoutTrustProxyHops_failsNamingTheVariable', async () => {
    production(undefined, 'https://cocktails.example.com');

    await expect(loadEnv()).rejects.toThrow(HOPS_MESSAGE);
  });

  it('env_productionWithEmptyTrustProxyHops_failsAsUnset', async () => {
    production('', 'https://cocktails.example.com');

    await expect(loadEnv()).rejects.toThrow(HOPS_MESSAGE);
  });

  it('env_productionWithoutClientOrigin_failsNamingTheVariable', async () => {
    production('1', undefined);

    await expect(loadEnv()).rejects.toThrow(/CLIENT_ORIGIN: is required in production/);
  });

  it('env_productionWithEmptyClientOrigin_failsAsUnset', async () => {
    production('1', '');

    await expect(loadEnv()).rejects.toThrow(/CLIENT_ORIGIN: is required in production/);
  });

  it('env_productionWithNeither_listsBothInOneError', async () => {
    production(undefined, undefined);

    await expect(loadEnv()).rejects.toThrow(/TRUST_PROXY_HOPS[\s\S]*CLIENT_ORIGIN/);
  });

  it('env_productionWithPublicHttpOrigin_fails', async () => {
    production('1', 'http://cocktails.example.com');

    await expect(loadEnv()).rejects.toThrow(HTTPS_MESSAGE);
  });

  it.each([
    'http://localhost.evil.com',
    'http://127.0.0.1.example.com',
    'http://localhost@evil.com',
    'file:///',
    'ws://localhost:3009',
  ])('env_productionWithLookAlikeLocalhost_fails (%s)', async (origin) => {
    production('1', origin);

    await expect(loadEnv()).rejects.toThrow(HTTPS_MESSAGE);
  });

  it.each([
    'http://localhost:3009',
    'http://127.0.0.1:3100',
    'http://[::1]:3009',
    'http://LOCALHOST:3009',
  ])('env_productionWithLoopbackHttpOrigin_ok (%s)', async (origin) => {
    production('0', origin);

    const { env } = await loadEnv();

    expect(env.CLIENT_ORIGIN).toBe(origin.toLowerCase());
  });

  it('env_productionWithHttpsOriginAndExplicitZeroHops_ok', async () => {
    production('0', 'https://cocktails.example.com');

    const { env } = await loadEnv();

    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });

  it('env_developmentWithoutProxySettings_keepsDefaults', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TRUST_PROXY_HOPS', undefined);
    vi.stubEnv('CLIENT_ORIGIN', undefined);

    const { env } = await loadEnv();

    expect(env.TRUST_PROXY_HOPS).toBe(0);
    expect(env.CLIENT_ORIGIN).toBe('http://localhost:5173');
  });
});
