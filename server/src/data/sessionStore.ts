import { db } from './connection.js';

// ---------------------------------------------------------------------------
// Prepared statements — hoisted so each is compiled once for the process
// ---------------------------------------------------------------------------

const stmtCreate = db.prepare<[string, number, number]>(
  'INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)',
);
const stmtValid = db.prepare<[string, number]>(
  'SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?',
);
const stmtRemove = db.prepare<[string]>('DELETE FROM sessions WHERE token_hash = ?');
const stmtPurge = db.prepare<[number]>('DELETE FROM sessions WHERE expires_at <= ?');

/** Admin sessions, keyed by the SHA-256 of the cookie token. Times are unix ms. */
export const sessionStore = {
  create(tokenHash: string, createdAt: number, expiresAt: number): void {
    stmtCreate.run(tokenHash, createdAt, expiresAt);
  },

  /** A session is valid strictly before its expiry. */
  isValid(tokenHash: string, now: number): boolean {
    return stmtValid.get(tokenHash, now) !== undefined;
  },

  remove(tokenHash: string): void {
    stmtRemove.run(tokenHash);
  },

  /** Deletes every expired session; returns how many went. */
  purgeExpired(now: number): number {
    return stmtPurge.run(now).changes;
  },

  /** Test helper: forget every session. */
  reset(): void {
    db.exec('DELETE FROM sessions');
  },
};
