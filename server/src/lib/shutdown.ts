import type { Server } from 'node:http';
import { SHUTDOWN_FORCE_MS } from '../config/limits.js';
import { logger } from './logger.js';

export interface ShutdownOptions {
  closeDb: () => void;
  forceAfterMs?: number;
  exit?: (code: number) => void;
  signals?: NodeJS.Signals[];
}

/**
 * Graceful shutdown on SIGTERM and SIGINT: stop accepting connections, drop idle
 * keep-alive ones, let in-flight requests finish and close their connections, close
 * the database, exit 0.
 * A forced-exit timer (created only after the first signal, unref'd) exits 1
 * after `forceAfterMs`; a second signal exits 1 at once. Returns the shutdown
 * function so tests can call it directly.
 */
export function installShutdown(server: Server, options: ShutdownOptions): () => void {
  const {
    closeDb,
    forceAfterMs = SHUTDOWN_FORCE_MS,
    exit = (code: number) => process.exit(code),
    signals = ['SIGTERM', 'SIGINT'],
  } = options;

  let started = false;

  // A response finishing after shutdown began must not leave its keep-alive
  // connection open until Node's keepAliveTimeout: end the socket once flushed.
  server.on('request', (req, res) => {
    res.once('finish', () => {
      if (started) req.socket.end();
    });
  });

  const shutdown = (): void => {
    if (started) {
      logger.error('Second shutdown signal, exiting now');
      exit(1);
      return;
    }
    started = true;
    logger.info('Shutting down');

    const forceTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit', { forceAfterMs });
      exit(1);
    }, forceAfterMs);
    forceTimer.unref();

    // The callback error (ERR_SERVER_NOT_RUNNING) is ignored on purpose: the database must still close.
    server.close(() => {
      clearTimeout(forceTimer);
      try {
        closeDb();
      } catch (error) {
        logger.error('Closing the database failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        exit(1);
        return;
      }
      logger.info('Shutdown complete');
      exit(0);
    });
    server.closeIdleConnections();
  };

  for (const signal of signals) process.on(signal, shutdown);
  return shutdown;
}
