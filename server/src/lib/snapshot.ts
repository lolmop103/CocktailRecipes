import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

/** Throws unless `PRAGMA integrity_check` on `file` returns exactly `ok`. */
export function verifyIntegrity(file: string): void {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const rows = db.pragma('integrity_check') as { integrity_check: string }[];
    const result = rows.map((row) => row.integrity_check).join('; ');
    if (result !== 'ok') throw new Error(`integrity check failed: ${result}`);
  } finally {
    db.close();
  }
}

/**
 * Copies `<dataDir>/cocktail.db` to `<dataDir>/snapshots/cocktail.db` with
 * SQLite's online backup, so the copy is consistent while the app writes.
 * Deliberately independent of `connection.ts`: it never migrates or creates a
 * database. A failed copy or check leaves no file behind.
 */
export async function snapshotDatabase(
  dataDir: string,
  verify: (file: string) => void = verifyIntegrity,
): Promise<string> {
  const source = join(dataDir, 'cocktail.db');
  if (!existsSync(source)) throw new Error(`database not found: ${source}`);
  // Any other open failure (permissions, a file that is not a database) keeps
  // SQLite's own message.
  const db = new Database(source, { readonly: true, fileMustExist: true });
  const target = join(dataDir, 'snapshots', 'cocktail.db');
  try {
    mkdirSync(join(dataDir, 'snapshots'), { recursive: true });
    removeCopy(target);
    await db.backup(target);
    db.close();
    makeSelfContained(target);
    verify(target);
    return target;
  } catch (error) {
    if (db.open) db.close();
    removeCopy(target);
    throw error;
  }
}

/** The copy and any `-wal`, `-shm` or `-journal` file SQLite left beside it. */
function removeCopy(target: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    rmSync(`${target}${suffix}`, { force: true });
  }
}

/**
 * The online backup keeps the source's WAL mode, so opening the copy would
 * create `-wal` and `-shm` files that a plain file copy leaves behind. Switching
 * it to the rollback journal makes the snapshot one file that holds everything.
 */
function makeSelfContained(file: string): void {
  const copy = new Database(file);
  try {
    copy.pragma('journal_mode = DELETE');
  } finally {
    copy.close();
  }
}
