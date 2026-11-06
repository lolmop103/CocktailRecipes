import { type NextFunction, type Request, type Response } from 'express';
import { isHttpError } from 'http-errors';
import type { ApiErrorBody } from '@cocktail/shared';
import { isAppError, TooManyRequestsError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

function bodyFor(err: unknown): ApiErrorBody | undefined {
  if (isAppError(err)) {
    return {
      status: err.status,
      message: err.message,
      ...(err instanceof ValidationError ? { errors: err.errors } : {}),
      ...(err instanceof TooManyRequestsError ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
    };
  }
  if (isHttpError(err)) {
    return { status: err.status, message: err.message };
  }
  return undefined;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const known = bodyFor(err);

  if (err instanceof TooManyRequestsError && known) {
    // Expected during a cooldown; the throttle writes its own single log line.
    res.set('Retry-After', String(err.retryAfterSeconds));
    res.status(known.status).json(known);
    return;
  }

  if (known) {
    if (known.status >= 500) {
      logger.error('Request failed', { method: req.method, path: req.path, status: known.status });
    } else {
      // 4xx are client mistakes — worth noting, not worth alarming about. One
      // line and no stack, so a flood of junk requests cannot flood the logs.
      logger.warn('Request rejected', {
        method: req.method,
        path: req.path,
        status: known.status,
        message: known.message,
      });
    }
    res.status(known.status).json(known);
    return;
  }

  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  const body: ApiErrorBody = { status: 500, message: 'Internal Server Error' };
  res.status(500).json(body);
}
