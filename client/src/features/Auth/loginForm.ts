import { ApiError } from '@/lib/http.js';

const DEFAULT_RETURN = '/cocktails';
/** A stand-in origin: only whether the value stays on it matters. */
const SAME_SITE = 'https://same-site.invalid';

/**
 * Where to go after logging in. Only a path on this site is accepted: an
 * absolute URL, `//host`, `/\host` or `/<tab>/host` would turn the login page
 * into an open redirect. The value is resolved the way a browser resolves it —
 * stripping tabs and newlines, reading `\` as `/` — and kept only when it
 * stays on the same origin.
 */
export function safeReturnTo(value: string | null): string {
  if (value === null || !value.startsWith('/')) return DEFAULT_RETURN;
  try {
    const url = new URL(value, SAME_SITE);
    return url.origin === SAME_SITE ? `${url.pathname}${url.search}${url.hash}` : DEFAULT_RETURN;
  } catch {
    return DEFAULT_RETURN;
  }
}

/** Shown for a 429 that carries no message (for example a proxy's HTML page). */
export const TOO_MANY_ATTEMPTS = 'Too many attempts. Try again in a moment.';

/** The line shown under the login form for a failed attempt. */
export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Could not log in. Try again.';
  switch (error.status) {
    case 401:
      return 'Wrong username or password';
    case 429:
      return error.message || TOO_MANY_ATTEMPTS;
    case 503:
      return 'Admin login is not configured';
    default:
      return 'Could not log in. Try again.';
  }
}
