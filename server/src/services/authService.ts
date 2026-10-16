import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { sessionStore } from '../data/sessionStore.js';
import { verifyPassword } from '../lib/password.js';
import { ServiceUnavailableError, UnauthorizedError } from '../lib/errors.js';

const TOKEN_BYTES = 32;
const DAY_MS = 86_400_000;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** Equal-length digests, so the comparison takes the same time whatever the input. */
function sameText(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function tokenHash(token: string): string {
  return sha256(token).toString('hex');
}

/** The single admin account and its sessions. */
export const authService = {
  /**
   * Checks the credentials and opens a session. The password is always
   * verified — also when the username is wrong — so the response time does
   * not reveal which of the two was wrong.
   */
  async login(
    username: string,
    password: string,
    now = Date.now(),
  ): Promise<{ token: string; maxAgeMs: number }> {
    const { ADMIN_USERNAME, ADMIN_PASSWORD_HASH, SESSION_TTL_DAYS } = env;
    if (ADMIN_USERNAME === undefined || ADMIN_PASSWORD_HASH === undefined) {
      throw new ServiceUnavailableError('Admin login is not configured');
    }

    const passwordOk = await verifyPassword(password, ADMIN_PASSWORD_HASH);
    if (!sameText(username, ADMIN_USERNAME) || !passwordOk) {
      throw new UnauthorizedError('Wrong username or password');
    }

    const maxAgeMs = SESSION_TTL_DAYS * DAY_MS;
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    sessionStore.purgeExpired(now);
    sessionStore.create(tokenHash(token), now, now + maxAgeMs);
    return { token, maxAgeMs };
  },

  logout(token: string | undefined): void {
    if (token !== undefined) sessionStore.remove(tokenHash(token));
  },

  /** The admin behind a session token, or undefined when it is missing or expired. */
  sessionFor(token: string | undefined, now = Date.now()): { username: string } | undefined {
    const username = env.ADMIN_USERNAME;
    if (token === undefined || username === undefined) return undefined;
    return sessionStore.isValid(tokenHash(token), now) ? { username } : undefined;
  },
};
