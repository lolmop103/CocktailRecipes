import { Router } from 'express';
import { loginSchema, type SessionInfo } from '@cocktail/shared';
import { env } from '../config/env.js';
import { readCookie, sessionCookieName, sessionCookieOptions } from '../lib/cookies.js';
import { parseOrThrow } from '../lib/validation.js';
import { authService } from '../services/authService.js';

export const authRouter = Router();

// Session state must never be cached by the browser or a proxy.
authRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  const { username, password } = parseOrThrow(loginSchema, req.body);
  const { token, maxAgeMs } = await authService.login(username, password);
  res.cookie(sessionCookieName(env.NODE_ENV), token, sessionCookieOptions(env.NODE_ENV, maxAgeMs));
  res.status(204).end();
});

// POST /api/auth/logout
authRouter.post('/logout', (req, res) => {
  const name = sessionCookieName(env.NODE_ENV);
  authService.logout(readCookie(req.get('cookie'), name));
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions(env.NODE_ENV, 0);
  res.clearCookie(name, clearOptions);
  res.status(204).end();
});

// GET /api/auth/me
authRouter.get('/me', (req, res) => {
  const body: SessionInfo = req.admin
    ? { authenticated: true, username: req.admin.username }
    : { authenticated: false };
  res.json(body);
});
