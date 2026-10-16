import type { Request, RequestHandler, Response } from 'express';
import { rateLimit, type RateLimitInfo } from 'express-rate-limit';
import { LOGIN_FAILURE_LIMIT, READ_LIMIT, WRITE_LIMIT } from '../config/limits.js';

const READ_METHODS = new Set(['GET', 'HEAD']);
const MESSAGE = 'Too many requests — try again in a moment';

/** The library records its counters on the request under `rateLimit`. */
type LimitedRequest = Request & { rateLimit?: RateLimitInfo };

/** The same JSON error shape as every other failure, plus when to retry. */
function tooManyRequests(req: LimitedRequest, res: Response): void {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfterSeconds =
    resetTime === undefined ? 1 : Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
  res.status(429).json({ status: 429, message: MESSAGE, retryAfterSeconds });
}

const common = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooManyRequests,
} as const;

/**
 * Per-IP limiters, created per app so every instance (and every test) has its
 * own in-memory counters. Paths are relative to the `/api` mount point.
 */
export function createRateLimiters(): {
  read: RequestHandler;
  write: RequestHandler;
  loginFailures: RequestHandler;
} {
  return {
    read: rateLimit({
      ...common,
      ...READ_LIMIT,
      // The container health check must never be refused.
      skip: (req) => !READ_METHODS.has(req.method) || req.path === '/health',
    }),
    write: rateLimit({
      ...common,
      ...WRITE_LIMIT,
      // Login has its own, stricter limit on failures.
      skip: (req) => READ_METHODS.has(req.method) || req.path === '/auth/login',
    }),
    loginFailures: rateLimit({
      ...common,
      ...LOGIN_FAILURE_LIMIT,
      skipSuccessfulRequests: true,
    }),
  };
}
