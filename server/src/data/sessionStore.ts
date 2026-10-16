import { db } from './connection.js';

// ---------------------------------------------------------------------------
// Prepared statements — hoisted so each is compiled once for the process
// ---------------------------------------------------------------------------

const stmtCreate = db.prepare<[string, string, number, number]>(
  'INSERT INTO sessions (token_hash, credential_tag, created_at, expires_at) VALUES (?, ?, ?, ?)',
);
const stmtValid = db.prepare<[string, string, number]>(
  'SELECT 1 FROM sessions WHERE token_hash = ? AND credential_tag = ? AND expires_at > ?',
);
const stmtRemove = db.prepare<[string]>('DELETE FROM sessions WHERE token_hash = ?');
const stmtPurge = db.prepare<[number]>('DELETE FROM sessions WHERE expires_at <= ?');

/** Admin sessions, keyed by the SHA-256 of the cookie token. Times are unix ms. */
export const sessionStore = {
  create(tokenHash: string, credentialTag: string, createdAt: number, expiresAt: number): void {
    stmtCreate.run(tokenHash, credentialTag, createdAt, expiresAt);
  },

  /**
   * A session is valid strictly before its expiry, and only for the admin
   * credentials it was opened with: changing the password ends every session.
   */
  isValid(tokenHash: string, credentialTag: string, now: number): boolean {
    return stmtValid.get(tokenHash, credentialTag, now) !== undefined;
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
