import { ApiError } from '@/lib/http.js';

const DEFAULT_RETURN = '/cocktails';

/**
 * Where to go after logging in. Only a path on this site is accepted: an
 * absolute URL, `//host` or `/\host` would turn the login page into an open
 * redirect.
 */
export function safeReturnTo(value: string | null): string {
  if (value === null || !value.startsWith('/')) return DEFAULT_RETURN;
  const second = value.charAt(1);
  return second === '/' || second === '\\' ? DEFAULT_RETURN : value;
}

/** The line shown under the login form for a failed attempt. */
export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Could not log in. Try again.';
  switch (error.status) {
    case 401:
      return 'Wrong username or password';
    case 429:
      return error.message;
    case 503:
      return 'Admin login is not configured';
    default:
      return 'Could not log in. Try again.';
  }
}
