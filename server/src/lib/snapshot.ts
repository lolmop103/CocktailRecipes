import { mkdirSync, rmSync } from 'node:fs';
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
  let db: Database.Database;
  try {
    db = new Database(source, { readonly: true, fileMustExist: true });
  } catch {
    throw new Error(`database not found: ${source}`);
  }
  const target = join(dataDir, 'snapshots', 'cocktail.db');
  try {
    mkdirSync(join(dataDir, 'snapshots'), { recursive: true });
    rmSync(target, { force: true });
    await db.backup(target);
    db.close();
    verify(target);
    return target;
  } catch (error) {
    if (db.open) db.close();
    rmSync(target, { force: true });
    throw error;
  }
}
