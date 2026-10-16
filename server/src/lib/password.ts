import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with Node's built-in scrypt — no native dependency to
 * compile, and the work runs on the libuv thread pool, so a burst of login
 * attempts does not block the event loop.
 *
 * Format: `scrypt$<N>$<r>$<p>$<salt base64>$<key base64>`. Verification reads
 * the cost from the string, so a hash made with other parameters (such as the
 * cheap test-only hash) still verifies.
 */

const COST = { N: 32_768, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
/** scrypt needs 128·N·r bytes; the default 32 MiB cap is exactly too small for N=2^15. */
const MAX_MEMORY = 64 * 1024 * 1024;
const MIN_PASSWORD_LENGTH = 12;
const FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

function derive(password: string, salt: Buffer, length: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, { ...options, maxmem: MAX_MEMORY }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_BYTES, COST);
  const { N, r, p } = COST;
  return `scrypt$${String(N)}$${String(r)}$${String(p)}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** False for a wrong password and for any malformed or unusable hash — never throws. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = FORMAT.exec(encoded);
  if (!match) return false;
  const [, N, r, p, salt, key] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(key, 'base64');
  if (expected.length === 0) return false;

  try {
    const actual = await derive(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    // Invalid cost parameters or a cost beyond the memory cap.
    return false;
  }
}

/**
 * The line to paste into `.env`. Single-quoted: Docker Compose interpolates `$`
 * in .env values, which would mangle the hash. Base64 never contains a quote.
 */
export function formatEnvLine(hash: string): string {
  return `ADMIN_PASSWORD_HASH='${hash}'`;
}

/** The error to show for a new password, or null when it is acceptable. */
export function checkNewPassword(first: string, second: string): string | null {
  if (first.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${String(MIN_PASSWORD_LENGTH)} characters`;
  if (first !== second) return 'The passwords do not match';
  return null;
}
