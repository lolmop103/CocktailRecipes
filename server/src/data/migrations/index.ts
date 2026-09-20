import type { Database } from 'better-sqlite3';

export interface Migration {
  /** Monotonic, never reordered or renumbered once released. */
  version: number;
  name: string;
  up: (db: Database) => void;
}

const m001_initialSchema: Migration = {
  version: 1,
  name: 'initial_schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS recipes (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        instructions TEXT,
        glass_type   TEXT,
        tags         TEXT,      -- JSON array stored as text
        rating       INTEGER,   -- 1-5 or NULL
        is_mocktail  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS recipe_ingredients (
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        position  INTEGER NOT NULL,
        name      TEXT NOT NULL,
        amount    TEXT,
        PRIMARY KEY (recipe_id, position)
      );

      CREATE TABLE IF NOT EXISTS ingredient_meta (
        key          TEXT PRIMARY KEY,  -- lower-cased name
        name         TEXT NOT NULL,
        is_alcoholic INTEGER            -- 1=true, 0=false, NULL=unclassified
      );

      CREATE TABLE IF NOT EXISTS collections (
        id   TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collection_recipes (
        collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        recipe_id     TEXT NOT NULL,
        PRIMARY KEY (collection_id, recipe_id)
      );
    `);
  },
};

const m002_idSequence: Migration = {
  version: 2,
  name: 'id_sequence',
  up: (db) => {
    // A plain MAX(id)+1 reuses the id of a deleted row, which silently
    // re-points stale references at a different record.
    db.exec(`
      CREATE TABLE IF NOT EXISTS id_sequence (
        entity  TEXT PRIMARY KEY,
        next_id INTEGER NOT NULL
      );
    `);
  },
};

const m003_filterIndexes: Migration = {
  version: 3,
  name: 'filter_indexes',
  up: (db) => {
    // NOTE: idx_recipe_ingredients_name cannot serve the ingredient filter,
    // which matches substrings ("rum" must find "white rum") — SQLite cannot
    // use an index for a LIKE pattern with a leading wildcard. It is kept for
    // exact-name lookups; see the handoff before assuming it helps filtering.
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_name
        ON recipe_ingredients(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_recipes_name
        ON recipes(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_collection_recipes_recipe
        ON collection_recipes(recipe_id);
    `);
  },
};

const m004_collectionRecipesRecipeFk: Migration = {
  version: 4,
  name: 'collection_recipes_recipe_fk',
  up: (db) => {
    // SQLite cannot add a foreign key to an existing table, so the table is
    // rebuilt. Orphans are dropped on the way across — they could not have been
    // inserted under the new constraint anyway.
    db.exec(`
      CREATE TABLE collection_recipes_new (
        collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        recipe_id     TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        PRIMARY KEY (collection_id, recipe_id)
      );

      INSERT INTO collection_recipes_new (collection_id, recipe_id)
        SELECT cr.collection_id, cr.recipe_id
        FROM collection_recipes cr
        JOIN collections c ON c.id = cr.collection_id
        JOIN recipes r ON r.id = cr.recipe_id;

      DROP TABLE collection_recipes;
      ALTER TABLE collection_recipes_new RENAME TO collection_recipes;

      CREATE INDEX IF NOT EXISTS idx_collection_recipes_recipe
        ON collection_recipes(recipe_id);
    `);
  },
};

/** Ordered by version. Append only — never edit a released migration. */
export const MIGRATIONS: Migration[] = [
  m001_initialSchema,
  m002_idSequence,
  m003_filterIndexes,
  m004_collectionRecipesRecipeFk,
];
