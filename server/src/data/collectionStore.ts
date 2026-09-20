import { db } from './db.js';
import { resetDb } from './seed.js';
import { allocateId } from './ids.js';
import type { Collection } from '@cocktail/shared';

interface CollectionRow {
  id: string;
  name: string;
}

interface MembershipRow {
  collection_id: string;
  recipe_id: string;
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const stmtGetAll = db.prepare<[]>('SELECT id, name FROM collections ORDER BY name');
const stmtGetById = db.prepare<[string]>('SELECT id, name FROM collections WHERE id = ?');
const stmtAllMemberships = db.prepare<[]>(
  'SELECT collection_id, recipe_id FROM collection_recipes ORDER BY collection_id, rowid',
);
const stmtMembershipsFor = db.prepare<[string]>(
  'SELECT collection_id, recipe_id FROM collection_recipes WHERE collection_id = ? ORDER BY rowid',
);
const stmtInsert = db.prepare<[string, string]>('INSERT INTO collections (id, name) VALUES (?, ?)');
const stmtAddRecipe = db.prepare<[string, string]>(
  'INSERT OR IGNORE INTO collection_recipes (collection_id, recipe_id) VALUES (?, ?)',
);
const stmtRemoveRecipe = db.prepare<[string, string]>(
  'DELETE FROM collection_recipes WHERE collection_id = ? AND recipe_id = ?',
);
const stmtDelete = db.prepare<[string]>('DELETE FROM collections WHERE id = ?');
const stmtRemoveFromAll = db.prepare<[string]>(
  'DELETE FROM collection_recipes WHERE recipe_id = ?',
);

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function hydrateOne(row: CollectionRow): Collection {
  const recipeIds = (stmtMembershipsFor.all(row.id) as MembershipRow[]).map((r) => r.recipe_id);
  return { id: row.id, name: row.name, recipeIds };
}

/** Hydrates every collection in two queries rather than one per collection. */
function hydrateAll(rows: CollectionRow[]): Collection[] {
  const byCollection = new Map<string, string[]>();
  for (const row of stmtAllMemberships.all() as MembershipRow[]) {
    const bucket = byCollection.get(row.collection_id);
    if (bucket) bucket.push(row.recipe_id);
    else byCollection.set(row.collection_id, [row.recipe_id]);
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    recipeIds: byCollection.get(row.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Public store
// ---------------------------------------------------------------------------

export const collectionStore = {
  getAll(): Collection[] {
    return hydrateAll(stmtGetAll.all() as CollectionRow[]);
  },

  getById(id: string): Collection | undefined {
    const row = stmtGetById.get(id) as CollectionRow | undefined;
    return row ? hydrateOne(row) : undefined;
  },

  create(name: string): Collection {
    const id = allocateId('collections');
    stmtInsert.run(id, name);
    return hydrateOne(stmtGetById.get(id) as CollectionRow);
  },

  addRecipe(collectionId: string, recipeId: string): Collection | undefined {
    const row = stmtGetById.get(collectionId) as CollectionRow | undefined;
    if (!row) return undefined;
    stmtAddRecipe.run(collectionId, recipeId);
    return hydrateOne(row);
  },

  removeRecipe(collectionId: string, recipeId: string): Collection | undefined {
    const row = stmtGetById.get(collectionId) as CollectionRow | undefined;
    if (!row) return undefined;
    stmtRemoveRecipe.run(collectionId, recipeId);
    return hydrateOne(row);
  },

  deleteCollection(id: string): boolean {
    return stmtDelete.run(id).changes > 0;
  },

  /** Remove a recipe from every collection (called when a recipe is deleted) */
  removeRecipeFromAll(recipeId: string): void {
    stmtRemoveFromAll.run(recipeId);
  },

  /** Reset — used in tests */
  reset(): void {
    resetDb();
  },
};
