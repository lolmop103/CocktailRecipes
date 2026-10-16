import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import createError from 'http-errors';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { router } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { env } from './config/env.js';
import { createRateLimiters } from './middleware/rateLimits.js';

const API_PREFIX = '/api';

export function createApp(): Express {
  const app = express();
  // Behind the owner's Caddy this is 1, so req.ip is the address Caddy saw —
  // never one a client wrote into X-Forwarded-For itself.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // Security
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );

  // Per-IP limits, before any body is parsed so a refused request costs little.
  const limits = createRateLimiters();
  app.use(API_PREFIX, limits.read, limits.write);
  app.use(`${API_PREFIX}/auth/login`, limits.loginFailures);

  // Parsing
  // The largest valid recipe is well under this; anything bigger is refused with a 413.
  app.use(express.json({ limit: '64kb' }));

  // Routes
  app.use(API_PREFIX, router);

  // Anything under /api that got this far does not exist. This must be
  // registered before the SPA fallback, otherwise the fallback would answer
  // unknown API calls with index.html and a misleading 200.
  app.use(API_PREFIX, (req, _res, next) => {
    next(createError(404, `Cannot ${req.method} ${API_PREFIX}${req.path}`));
  });

  // In production serve the pre-built Vite client from client/dist/
  if (env.NODE_ENV === 'production') {
    const clientDist = resolve(process.cwd(), 'client', 'dist');
    if (existsSync(clientDist)) {
      app.use(express.static(clientDist));
      // Express 5 (path-to-regexp v8) no longer accepts a bare '*'; the
      // wildcard must be named.
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(resolve(clientDist, 'index.html'));
      });
    }
  }

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
