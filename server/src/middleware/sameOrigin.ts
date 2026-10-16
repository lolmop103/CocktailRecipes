import type { RequestHandler } from 'express';
import { ForbiddenError } from '../lib/errors.js';

/** Methods that cannot change data; everything else must come from our own site. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The second CSRF layer next to the `SameSite=Strict` cookie: a request that
 * changes data must carry an `Origin` header equal to the site's own. Browsers
 * always send it on such requests, so a missing one is refused as well.
 */
export function sameOrigin(allowedOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || req.get('origin') === allowedOrigin) {
      next();
      return;
    }
    next(new ForbiddenError('Cross-site request refused'));
  };
}
