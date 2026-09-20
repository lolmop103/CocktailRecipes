import type { Database, Statement } from 'better-sqlite3';
import { MIGRATIONS, type Migration } from './migrations/index.js';
import { logger } from '../lib/logger.js';

const CREATE_LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;

function appliedVersions(db: Database): Set<number> {
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  return new Set(rows.map((r) => r.version));
}

/**
 * Brings the database up to the latest schema version.
 *
 * Each migration runs inside its own transaction and is recorded in
 * `schema_migrations`, so a half-applied migration can never be marked done and
 * a restart picks up exactly where it left off.
 */
export function migrate(db: Database): void {
  db.exec(CREATE_LEDGER);

  const done = appliedVersions(db);
  const pending = MIGRATIONS.filter((m) => !done.has(m.version)).sort(
    (a, b) => a.version - b.version,
  );

  if (pending.length === 0) return;

  const record = db.prepare<[number, string, string]>(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  );

  for (const migration of pending) {
    applyOne(db, migration, record);
  }

  logger.info('Database migrated', {
    applied: pending.map((m) => `${String(m.version)}_${m.name}`),
  });
}

function applyOne(
  db: Database,
  migration: Migration,
  record: Statement<[number, string, string]>,
): void {
  // Foreign keys must be off while a table is rebuilt, and SQLite ignores the
  // pragma inside a transaction — hence toggling it around, not within.
  const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1;
  if (fkWasOn) db.pragma('foreign_keys = OFF');

  try {
    db.transaction(() => {
      migration.up(db);
      record.run(migration.version, migration.name, new Date().toISOString());
    })();
  } finally {
    if (fkWasOn) db.pragma('foreign_keys = ON');
  }
}
