/**
 * Request limits per client IP (spec §4). Reads are generous enough for
 * scrolling and filtering; writes are the admin's; failed logins are few.
 */
const MINUTE_MS = 60_000;

export const READ_LIMIT = { limit: 120, windowMs: MINUTE_MS } as const;
export const WRITE_LIMIT = { limit: 60, windowMs: MINUTE_MS } as const;
export const LOGIN_FAILURE_LIMIT = { limit: 5, windowMs: 15 * MINUTE_MS } as const;
