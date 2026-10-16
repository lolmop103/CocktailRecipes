import type { CookieOptions } from 'express';
import type { Env } from '../config/env.js';

const SESSION_COOKIE = 'cocktail_session';

/**
 * In production the cookie carries the `__Host-` prefix, which browsers only
 * accept with `Secure`, `Path=/` and no `Domain` — it cannot be set or
 * shadowed by any other host. Development and tests run over plain HTTP, where
 * that prefix (and `Secure`) would make the browser drop the cookie.
 */
export function sessionCookieName(nodeEnv: Env['NODE_ENV']): string {
  return nodeEnv === 'production' ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
}

export function sessionCookieOptions(nodeEnv: Env['NODE_ENV'], maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: nodeEnv === 'production',
    maxAge: maxAgeMs,
  };
}

/** The value of one cookie from a `Cookie` header, or undefined. Never throws. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
