import { describe, expect, it } from 'vitest';
import { LOGIN_THROTTLE } from '../src/config/limits.js';
import { loginThrottle } from '../src/lib/loginThrottle.js';

const SECOND = 1000;

describe('loginThrottle', () => {
  it('admit_firstThreeAttempts_areAdmittedAndThirdStartsCooldown', () => {
    expect(loginThrottle.admit(0)).toEqual({ ok: true, failures: 1, cooldownSeconds: 0 });
    expect(loginThrottle.admit(1 * SECOND)).toEqual({ ok: true, failures: 2, cooldownSeconds: 0 });
    expect(loginThrottle.admit(2 * SECOND)).toEqual({ ok: true, failures: 3, cooldownSeconds: 30 });
  });

  it('admit_insideCooldown_refusesAndFlagsOnlyTheFirstRefusal', () => {
    for (const t of [0, 1, 2]) loginThrottle.admit(t * SECOND);
    expect(loginThrottle.admit(3 * SECOND)).toEqual({
      ok: false,
      retryAfterSeconds: 29,
      firstRefusal: true,
    });
    expect(loginThrottle.admit(4 * SECOND)).toEqual({
      ok: false,
      retryAfterSeconds: 28,
      firstRefusal: false,
    });
  });

  it('admit_afterCooldown_admitsAndRefusalsDidNotExtendTheWindow', () => {
    for (const t of [0, 1, 2]) loginThrottle.admit(t * SECOND);
    loginThrottle.admit(3 * SECOND);
    loginThrottle.admit(31 * SECOND);
    expect(loginThrottle.admit(32 * SECOND)).toEqual({
      ok: true,
      failures: 4,
      cooldownSeconds: 30,
    });
    expect(loginThrottle.admit(33 * SECOND)).toMatchObject({ ok: false, retryAfterSeconds: 29 });
  });

  it('admit_newWindow_reportsFirstRefusalAgain', () => {
    for (const t of [0, 1, 2]) loginThrottle.admit(t * SECOND);
    loginThrottle.admit(3 * SECOND);
    loginThrottle.admit(32 * SECOND);
    expect(loginThrottle.admit(33 * SECOND)).toMatchObject({ ok: false, firstRefusal: true });
  });

  it('succeed_afterAnAttempt_givesThreeFreshAttempts', () => {
    for (const t of [0, 1, 2]) loginThrottle.admit(t * SECOND);
    loginThrottle.succeed();
    expect(loginThrottle.admit(3 * SECOND)).toMatchObject({ ok: true, failures: 1 });
    expect(loginThrottle.admit(4 * SECOND)).toMatchObject({ ok: true, failures: 2 });
    expect(loginThrottle.admit(5 * SECOND)).toMatchObject({ ok: true, failures: 3 });
  });

  it('admit_afterIdleReset_countsFromOneAgain', () => {
    loginThrottle.admit(0);
    loginThrottle.admit(1 * SECOND);
    const idleAt = 1 * SECOND + LOGIN_THROTTLE.idleResetMs;
    expect(loginThrottle.admit(idleAt)).toMatchObject({
      ok: true,
      failures: 1,
      cooldownSeconds: 0,
    });
  });

  it('admit_justBeforeIdleReset_keepsCounting', () => {
    loginThrottle.admit(0);
    expect(loginThrottle.admit(LOGIN_THROTTLE.idleResetMs - 1)).toMatchObject({ failures: 2 });
  });

  it('admit_fractionOfASecondLeft_roundsUpToAtLeastOne', () => {
    for (const t of [0, 1, 2]) loginThrottle.admit(t * SECOND);
    const nearEnd = 2 * SECOND + LOGIN_THROTTLE.cooldownMs - 1;
    expect(loginThrottle.admit(nearEnd)).toMatchObject({ ok: false, retryAfterSeconds: 1 });
    expect(loginThrottle.admit(2 * SECOND + 500)).toMatchObject({ retryAfterSeconds: 30 });
  });

  it('admit_clockStepsBackwardsDuringCooldown_waitNeverExceedsOneCooldown', () => {
    for (const t of [100, 101, 102]) loginThrottle.admit(t * SECOND);
    const refused = loginThrottle.admit(10 * SECOND);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.retryAfterSeconds).toBeLessThanOrEqual(30);
    expect(loginThrottle.admit(41 * SECOND).ok).toBe(true);
  });

  it('admit_hundredCallsAtOnce_admitsExactlyThree', () => {
    const results = Array.from({ length: 100 }, () => loginThrottle.admit(0));
    expect(results.filter((r) => r.ok)).toHaveLength(LOGIN_THROTTLE.freeAttempts);
  });
});
