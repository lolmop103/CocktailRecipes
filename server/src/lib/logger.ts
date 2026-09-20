/**
 * Minimal structured logger.
 *
 * The single place in the codebase allowed to touch `console` — every other
 * module goes through here so output stays greppable and can be swapped for a
 * transport (pino, OpenTelemetry) without touching call sites.
 *
 * Never log PII (see AGENT.md § GDPR).
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function activeLevel(): Level {
  const raw = process.env['LOG_LEVEL'];
  return raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error' ? raw : 'info';
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context !== undefined ? { context } : {}),
  };

  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};
