import type { RequestHandler, Response } from 'express';
import { sep } from 'node:path';

const ONE_YEAR_IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

/**
 * API reads may be stored but must be revalidated: with Express's ETag a
 * repeat request is answered 304 with an empty body. Routes that must never
 * be stored (the auth routes) override this with `no-store`.
 */
export const apiCacheHeaders: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') res.set('Cache-Control', REVALIDATE);
  next();
};

/**
 * Vite puts a content hash in every file name under `assets/`, so those never
 * change and can be cached for a year. Everything else — `index.html` above
 * all — is revalidated, so a deploy is picked up at once.
 */
export function staticCacheHeaders(res: Response, filePath: string): void {
  res.set(
    'Cache-Control',
    filePath.includes(`${sep}assets${sep}`) ? ONE_YEAR_IMMUTABLE : REVALIDATE,
  );
}

export const NO_CACHE = REVALIDATE;
