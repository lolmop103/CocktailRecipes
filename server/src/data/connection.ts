import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { env } from '../config/env.js';
import { migrate } from './migrator.js';

const DEFAULT_DATA_DIR = resolve(process.cwd(), 'data-store');

/** Tests run against a throwaway in-memory database. */
const dbPath =
  env.NODE_ENV === 'test' ? ':memory:' : resolve(env.DATA_DIR ?? DEFAULT_DATA_DIR, 'cocktail.db');

if (dbPath !== ':memory:') {
  mkdirSync(dirname(dbPath), { recursive: true });
}

export const db = new Database(dbPath);

// Better concurrent read performance (no-op on :memory:).
db.pragma('journal_mode = WAL');
// Enforce foreign key constraints.
db.pragma('foreign_keys = ON');

// Bring the schema up to date before anyone prepares a statement against it.
migrate(db);
