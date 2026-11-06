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

  const rowCount = () =>
    (db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n;

  it('replaceAll_twice_exactlyOneRowAndItIsTheSecond', () => {
    sessionStore.replaceAll('first', TAG, NOW, NOW + HOUR);
    sessionStore.replaceAll('second', TAG, NOW, NOW + HOUR);

    expect(rowCount()).toBe(1);
    expect(sessionStore.isValid('second', TAG, NOW)).toBe(true);
    expect(sessionStore.isValid('first', TAG, NOW)).toBe(false);
  });

  it('replaceAll_removesEveryOtherRow', () => {
    sessionStore.create('a', TAG, NOW, NOW + HOUR);
    sessionStore.create('b', TAG, NOW, NOW + HOUR);

    sessionStore.replaceAll('c', TAG, NOW, NOW + HOUR);

    expect(rowCount()).toBe(1);
  });

  it('replaceAll_insertFails_deleteRolledBack', () => {
    sessionStore.replaceAll('old', TAG, NOW, NOW + HOUR);

    // An object is not a bindable SQLite parameter: the insert throws after the delete ran,
    // so the old row surviving proves the transaction rolled back.
    expect(() => sessionStore.replaceAll({} as unknown as string, TAG, NOW, NOW + HOUR)).toThrow();

    expect(rowCount()).toBe(1);
    expect(sessionStore.isValid('old', TAG, NOW)).toBe(true);
  });

  it('removeAll_leavesNoRows', () => {
    sessionStore.create('a', TAG, NOW, NOW + HOUR);
    sessionStore.create('b', TAG, NOW, NOW + HOUR);

    sessionStore.removeAll();

    expect(rowCount()).toBe(0);
  });
});
