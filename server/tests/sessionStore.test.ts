import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/data/connection.js';
import { sessionStore } from '../src/data/sessionStore.js';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;
const TAG = 'credentials-v1';

beforeEach(() => {
  sessionStore.reset();
});

describe('sessions table', () => {
  it('migrate_freshDb_hasSessionsTableAndExpiryIndex', () => {
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%session%'").all() as {
        name: string;
      }[]
    ).map((row) => row.name);

    expect(names).toEqual(expect.arrayContaining(['sessions', 'idx_sessions_expires']));
  });
});

describe('sessionStore', () => {
  it('isValid_beforeExpiry_true', () => {
    sessionStore.create('hash-a', TAG, NOW, NOW + HOUR);

    expect(sessionStore.isValid('hash-a', TAG, NOW + HOUR - 1)).toBe(true);
  });

  it('isValid_atExpiry_false', () => {
    sessionStore.create('hash-a', TAG, NOW, NOW + HOUR);

    expect(sessionStore.isValid('hash-a', TAG, NOW + HOUR)).toBe(false);
  });

  it('isValid_unknownHash_false', () => {
    expect(sessionStore.isValid('nope', TAG, NOW)).toBe(false);
  });

  it('remove_thenIsValid_false', () => {
    sessionStore.create('hash-a', TAG, NOW, NOW + HOUR);

    sessionStore.remove('hash-a');

    expect(sessionStore.isValid('hash-a', TAG, NOW)).toBe(false);
  });

  it('purgeExpired_removesOnlyExpired_returnsCount', () => {
    sessionStore.create('old-1', TAG, NOW - 2 * HOUR, NOW - HOUR);
    sessionStore.create('old-2', TAG, NOW - 2 * HOUR, NOW);
    sessionStore.create('fresh', TAG, NOW, NOW + HOUR);

    const purged = sessionStore.purgeExpired(NOW);

    expect(purged).toBe(2);
    expect(sessionStore.isValid('fresh', TAG, NOW)).toBe(true);
  });

  it('isValid_otherCredentialTag_false', () => {
    sessionStore.create('hash-a', TAG, NOW, NOW + HOUR);

    expect(sessionStore.isValid('hash-a', 'credentials-v2', NOW)).toBe(false);
  });
});
