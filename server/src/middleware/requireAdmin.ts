import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../lib/errors.js';

/**
 * Lets a request through only when the session middleware recognised the
 * admin. Generic over the route's parameters so a guarded route keeps its
 * typed `req.params`.
 */
export function requireAdmin<P>(req: Request<P>, _res: Response, next: NextFunction): void {
  next(req.admin ? undefined : new UnauthorizedError('Log in to make changes'));
}
