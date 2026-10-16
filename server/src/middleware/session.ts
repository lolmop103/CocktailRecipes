import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { readCookie, sessionCookieName } from '../lib/cookies.js';
import { authService } from '../services/authService.js';

/** Marks the request as the admin's when it carries a valid session cookie. */
export const session: RequestHandler = (req, _res, next) => {
  const token = readCookie(req.get('cookie'), sessionCookieName(env.NODE_ENV));
  req.admin = authService.sessionFor(token);
  next();
};
