import { LOGIN_THROTTLE } from '../config/limits.js';

/**
 * Global login throttle (spec "Throttle"): three numbers of state, no timers,
 * nothing keyed on a client. A refused attempt never extends the window.
 */
export type Admission =
  | { ok: true; failures: number; cooldownSeconds: number }
  | { ok: false; retryAfterSeconds: number; firstRefusal: boolean };

const MS_PER_SECOND = 1000;

interface ThrottleState {
  failures: number;
  lastAttemptAt: number | null;
  blockedUntil: number;
  refusalReported: boolean;
}

const state: ThrottleState = {
  failures: 0,
  lastAttemptAt: null,
  blockedUntil: 0,
  refusalReported: false,
};

function clear(): void {
  state.failures = 0;
  state.lastAttemptAt = null;
  state.blockedUntil = 0;
  state.refusalReported = false;
}

function admit(now: number = Date.now()): Admission {
  if (state.lastAttemptAt !== null && now < state.lastAttemptAt) {
    // The wall clock stepped back: re-anchor so a wait never exceeds one cooldown.
    state.lastAttemptAt = now;
    state.blockedUntil = Math.min(state.blockedUntil, now + LOGIN_THROTTLE.cooldownMs);
  }
  if (state.lastAttemptAt !== null && now - state.lastAttemptAt >= LOGIN_THROTTLE.idleResetMs) {
    clear();
  }
  if (now < state.blockedUntil) {
    const firstRefusal = !state.refusalReported;
    state.refusalReported = true;
    const retryAfterSeconds = Math.max(1, Math.ceil((state.blockedUntil - now) / MS_PER_SECOND));
    return { ok: false, retryAfterSeconds, firstRefusal };
  }
  state.failures += 1;
  state.lastAttemptAt = now;
  state.refusalReported = false;
  let cooldownSeconds = 0;
  if (state.failures >= LOGIN_THROTTLE.freeAttempts) {
    state.blockedUntil = now + LOGIN_THROTTLE.cooldownMs;
    cooldownSeconds = LOGIN_THROTTLE.cooldownMs / MS_PER_SECOND;
  }
  return { ok: true, failures: state.failures, cooldownSeconds };
}

export const loginThrottle = {
  admit,
  succeed: clear,
  reset: clear,
};
