import { db } from './db.js';
import { resetDb } from './seed.js';
import type { IngredientMeta } from '@cocktail/shared';

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

interface MetaRow {
  key: string;
  name: string;
  is_alcoholic: number | null;
}

function rowToMeta(row: MetaRow): IngredientMeta {
  return {
    name: row.name,
    isAlcoholic: row.is_alcoholic === null ? null : row.is_alcoholic === 1,
  };
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const stmtGetAll = db.prepare<[]>('SELECT * FROM ingredient_meta ORDER BY name COLLATE NOCASE');
const stmtGetByKey = db.prepare<[string]>('SELECT * FROM ingredient_meta WHERE key = ?');
const stmtInsert = db.prepare<[string, string]>(
  'INSERT OR IGNORE INTO ingredient_meta (key, name, is_alcoholic) VALUES (?, ?, NULL)',
);
const stmtUpsert = db.prepare<[string, string, number]>(
  'INSERT INTO ingredient_meta (key, name, is_alcoholic) VALUES (?, ?, ?)' +
    ' ON CONFLICT(key) DO UPDATE SET is_alcoholic = excluded.is_alcoholic',
);

// ---------------------------------------------------------------------------
// Public store
// ---------------------------------------------------------------------------

export const ingredientMetaStore = {
  getAll(): IngredientMeta[] {
    return (stmtGetAll.all() as MetaRow[]).map(rowToMeta);
  },

  get(name: string): IngredientMeta | undefined {
    const row = stmtGetByKey.get(name.toLowerCase()) as MetaRow | undefined;
    return row ? rowToMeta(row) : undefined;
  },

  /** Add with isAlcoholic: null if not already present */
  ensureExists(name: string): void {
    stmtInsert.run(name.toLowerCase(), name);
  },

  /** Create or update the alcoholic classification */
  setAlcoholic(name: string, isAlcoholic: boolean): IngredientMeta {
    const key = name.toLowerCase();
    stmtUpsert.run(key, name, isAlcoholic ? 1 : 0);
    return rowToMeta(stmtGetByKey.get(key) as MetaRow);
  },

  /** Reset to seed data — used in tests */
  reset(): void {
    resetDb();
  },
};
