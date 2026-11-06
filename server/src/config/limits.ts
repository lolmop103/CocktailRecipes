/**
 * Request limits per client IP (spec §4). Reads are generous enough for
 * scrolling and filtering; writes are the admin's. Login is not limited per
 * IP: failed logins are few and handled by the global throttle below.
 */
const MINUTE_MS = 60_000;

export const READ_LIMIT = { limit: 120, windowMs: MINUTE_MS } as const;
export const WRITE_LIMIT = { limit: 60, windowMs: MINUTE_MS } as const;

/**
 * Global login throttle (WP4): no client key, one shared window. The first
 * attempts are free; from the third on every admitted attempt starts a cooldown.
 */
export const LOGIN_THROTTLE = {
  freeAttempts: 3,
  cooldownMs: 30_000,
  idleResetMs: 15 * MINUTE_MS,
} as const;
