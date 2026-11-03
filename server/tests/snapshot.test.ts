import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeSync,
  writeFileSync,
  closeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { snapshotDatabase, verifyIntegrity } from '../src/lib/snapshot.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'snapshot-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Creates `<dir>/cocktail.db` (WAL, like the app) holding `rows` rows. */
function populate(rows: number, payload = 'x'): Database.Database {
  const db = new Database(join(dir, 'cocktail.db'));
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO t (body) VALUES (?)');
  db.transaction(() => {
    for (let i = 0; i < rows; i++) insert.run(payload);
  })();
  return db;
}

function countRows(file: string): number {
  const db = new Database(file, { readonly: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM t').get() as { n: number }).n;
  } finally {
    db.close();
  }
}

describe('snapshotDatabase', () => {
  it('snapshotDatabase_populatedDatabase_copiesEveryRow', async () => {
    populate(100).close();

    const file = await snapshotDatabase(dir);

    expect(countRows(file)).toBe(100);
  });

  it('snapshotDatabase_concurrentWriter_yieldsIntactCopy', async () => {
    const writer = populate(200);
    const insert = writer.prepare('INSERT INTO t (body) VALUES (?)');
    const timer = setInterval(() => insert.run('during'), 1);
    try {
      const file = await snapshotDatabase(dir);

      expect(() => verifyIntegrity(file)).not.toThrow();
      expect(countRows(file)).toBeGreaterThanOrEqual(200);
    } finally {
      clearInterval(timer);
      writer.close();
    }
  });

  it('snapshotDatabase_missingDatabase_rejectsAndCreatesNothing', async () => {
    await expect(snapshotDatabase(dir)).rejects.toThrow('database not found');

    expect(existsSync(join(dir, 'cocktail.db'))).toBe(false);
    expect(existsSync(join(dir, 'snapshots'))).toBe(false);
  });

  it('snapshotDatabase_fileThatIsNotADatabase_rejectsWithoutClaimingItIsMissing', async () => {
    writeFileSync(join(dir, 'cocktail.db'), 'this is not a database'.repeat(100));

    await expect(snapshotDatabase(dir)).rejects.toThrow(Error);
    await expect(snapshotDatabase(dir)).rejects.not.toThrow('database not found');
    expect(existsSync(join(dir, 'snapshots', 'cocktail.db'))).toBe(false);
  });

  it('snapshotDatabase_earlierSnapshot_replacesIt', async () => {
    const db = populate(10);
    await snapshotDatabase(dir);
    db.exec("INSERT INTO t (body) VALUES ('later')");
    db.close();

    const file = await snapshotDatabase(dir);

    expect(countRows(file)).toBe(11);
  });

  it('snapshotDatabase_anyRun_writesOnlyUnderSnapshotsDirectory', async () => {
    populate(1).close();

    const file = await snapshotDatabase(dir);

    expect(file).toBe(join(dir, 'snapshots', 'cocktail.db'));
  });

  it('snapshotDatabase_verifyThrows_removesCopyAndRejects', async () => {
    populate(5).close();

    await expect(
      snapshotDatabase(dir, () => {
        throw new Error('verify boom');
      }),
    ).rejects.toThrow('verify boom');

    expect(existsSync(join(dir, 'snapshots', 'cocktail.db'))).toBe(false);
  });

  it('snapshotDatabase_fiveMegabyteDatabase_finishesUnderTwoSeconds', async () => {
    populate(1300, 'y'.repeat(4000)).close();
    expect(readFileSync(join(dir, 'cocktail.db')).length).toBeGreaterThan(5_000_000);

    const started = performance.now();
    await snapshotDatabase(dir);

    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('verifyIntegrity', () => {
  it('verifyIntegrity_healthyFile_doesNotThrow', async () => {
    populate(5).close();
    const file = await snapshotDatabase(dir);

    expect(() => verifyIntegrity(file)).not.toThrow();
  });

  it('verifyIntegrity_corruptedLaterPage_throws', async () => {
    populate(500, 'z'.repeat(200)).close();
    const file = await snapshotDatabase(dir);
    const fd = openSync(file, 'r+');
    writeSync(fd, Buffer.alloc(4096, 0xff), 0, 4096, 4096 * 5);
    closeSync(fd);

    expect(() => verifyIntegrity(file)).toThrow();
  });
});
