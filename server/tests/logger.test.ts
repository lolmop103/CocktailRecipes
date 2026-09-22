import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../src/lib/logger.js';

describe('logger', () => {
  const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    out.mockClear();
    err.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function lastLine(spy: typeof out): Record<string, unknown> {
    const call = spy.mock.calls.at(-1);
    if (!call) throw new Error('nothing was logged');
    return JSON.parse(String(call[0])) as Record<string, unknown>;
  }

  it('info_writesStructuredJson_toStdout', () => {
    logger.info('hello', { port: 3000 });

    const entry = lastLine(out);
    expect(entry).toMatchObject({ level: 'info', message: 'hello', context: { port: 3000 } });
    expect(typeof entry['time']).toBe('string');
    expect(err).not.toHaveBeenCalled();
  });

  it('warnAndError_goToStderr', () => {
    logger.warn('careful');
    logger.error('boom');

    expect(err).toHaveBeenCalledTimes(2);
    expect(lastLine(err)).toMatchObject({ level: 'error', message: 'boom' });
    expect(out).not.toHaveBeenCalled();
  });

  it('omitsContextKey_whenNoContextGiven', () => {
    logger.info('bare');

    expect(lastLine(out)).not.toHaveProperty('context');
  });

  it('debug_isSuppressed_atDefaultLevel', () => {
    vi.stubEnv('LOG_LEVEL', '');
    logger.debug('noise');

    expect(out).not.toHaveBeenCalled();
  });

  it('debug_isEmitted_whenLevelIsDebug', () => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    logger.debug('verbose');

    expect(lastLine(out)).toMatchObject({ level: 'debug' });
  });

  it('info_isSuppressed_whenLevelIsError', () => {
    vi.stubEnv('LOG_LEVEL', 'error');
    logger.info('quiet');
    logger.error('loud');

    expect(out).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('unknownLevel_fallsBackToInfo', () => {
    vi.stubEnv('LOG_LEVEL', 'shouting');
    logger.debug('hidden');
    logger.info('shown');

    expect(out).toHaveBeenCalledTimes(1);
  });
});
