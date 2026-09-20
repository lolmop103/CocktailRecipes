import { db } from './db.js';
import { resetDb } from './seed.js';
import { allocateId } from './ids.js';
import type { Ingredient, Recipe, UpdateRecipeInput as RecipeUpdate } from '@cocktail/shared';

// ---------------------------------------------------------------------------
// Row types (SQLite returns plain objects)
// ---------------------------------------------------------------------------

interface RecipeRow {
  id: string;
  name: string;
  instructions: string | null;
  glass_type: string | null;
  tags: string | null;
  rating: number | null;
  is_mocktail: number;
}

interface IngredientRow {
  recipe_id: string;
  name: string;
  amount: string | null;
}

// ---------------------------------------------------------------------------
// Prepared statements — hoisted so each is compiled once for the process
// ---------------------------------------------------------------------------

const stmtGetAll = db.prepare<[]>(
  'SELECT id, name, instructions, glass_type, tags, rating, is_mocktail FROM recipes',
);
const stmtGetById = db.prepare<[string]>(
  'SELECT id, name, instructions, glass_type, tags, rating, is_mocktail FROM recipes WHERE id = ?',
);
const stmtAllIngredients = db.prepare<[]>(
  'SELECT recipe_id, name, amount FROM recipe_ingredients ORDER BY recipe_id, position',
);
const stmtIngredientsFor = db.prepare<[string]>(
  'SELECT recipe_id, name, amount FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position',
);
const stmtInsertRecipe = db.prepare<
  [string, string, string | null, string | null, string | null, number | null, number]
>(
  'INSERT INTO recipes (id, name, instructions, glass_type, tags, rating, is_mocktail)' +
    ' VALUES (?, ?, ?, ?, ?, ?, ?)',
);
const stmtInsertIngredient = db.prepare<[string, number, string, string | null]>(
  'INSERT INTO recipe_ingredients (recipe_id, position, name, amount) VALUES (?, ?, ?, ?)',
);
const stmtDeleteIngredients = db.prepare<[string]>(
  'DELETE FROM recipe_ingredients WHERE recipe_id = ?',
);
const stmtUpdateRecipeFields = db.prepare<
  [string, string | null, string | null, string | null, number | null, number, string]
>(
  'UPDATE recipes SET name = ?, instructions = ?, glass_type = ?, tags = ?, rating = ?,' +
    ' is_mocktail = ? WHERE id = ?',
);
const stmtUpdateRating = db.prepare<[number, string]>('UPDATE recipes SET rating = ? WHERE id = ?');
const stmtDeleteRecipe = db.prepare<[string]>('DELETE FROM recipes WHERE id = ?');
const stmtExists = db.prepare<[string]>('SELECT 1 FROM recipes WHERE id = ?');

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toIngredient(row: IngredientRow): Ingredient {
  return { name: row.name, ...(row.amount !== null ? { amount: row.amount } : {}) };
}

function toRecipe(row: RecipeRow, ingredients: Ingredient[]): Recipe {
  return {
    id: row.id,
    name: row.name,
    ingredients,
    ...(row.instructions !== null ? { instructions: row.instructions } : {}),
    ...(row.glass_type !== null ? { glassType: row.glass_type } : {}),
    ...(row.tags !== null ? { tags: JSON.parse(row.tags) as string[] } : {}),
    ...(row.rating !== null ? { rating: row.rating } : {}),
    isMocktail: row.is_mocktail === 1,
  };
}

function hydrateOne(row: RecipeRow): Recipe {
  const ingredients = (stmtIngredientsFor.all(row.id) as IngredientRow[]).map(toIngredient);
  return toRecipe(row, ingredients);
}

/**
 * Hydrates every recipe in two queries rather than one per recipe.
 */
function hydrateAll(rows: RecipeRow[]): Recipe[] {
  const byRecipe = new Map<string, Ingredient[]>();
  for (const row of stmtAllIngredients.all() as IngredientRow[]) {
    const bucket = byRecipe.get(row.recipe_id);
    if (bucket) bucket.push(toIngredient(row));
    else byRecipe.set(row.recipe_id, [toIngredient(row)]);
  }
  return rows.map((row) => toRecipe(row, byRecipe.get(row.id) ?? []));
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

function writeIngredients(recipeId: string, ingredients: Ingredient[]): void {
  ingredients.forEach((ing, position) => {
    stmtInsertIngredient.run(recipeId, position, ing.name, ing.amount ?? null);
  });
}

const addRecipeTx = db.transaction((id: string, recipe: Omit<Recipe, 'id'>) => {
  stmtInsertRecipe.run(
    id,
    recipe.name,
    recipe.instructions ?? null,
    recipe.glassType ?? null,
    recipe.tags ? JSON.stringify(recipe.tags) : null,
    recipe.rating ?? null,
    recipe.isMocktail ? 1 : 0,
  );
  writeIngredients(id, recipe.ingredients);
});

/**
 * `undefined`/absent leaves a column alone; an explicit `null` clears it.
 */
function resolve<T>(patchValue: T | null | undefined, current: T | null): T | null {
  if (patchValue === undefined) return current;
  return patchValue === null ? null : patchValue;
}

const updateRecipeTx = db.transaction((id: string, patch: RecipeUpdate): RecipeRow | undefined => {
  const current = stmtGetById.get(id) as RecipeRow | undefined;
  if (!current) return undefined;

  const tags =
    patch.tags === undefined
      ? current.tags
      : patch.tags === null
        ? null
        : JSON.stringify(patch.tags);

  stmtUpdateRecipeFields.run(
    patch.name ?? current.name,
    resolve(patch.instructions, current.instructions),
    resolve(patch.glassType, current.glass_type),
    tags,
    resolve(patch.rating, current.rating),
    patch.isMocktail === undefined ? current.is_mocktail : patch.isMocktail ? 1 : 0,
    id,
  );

  if (patch.ingredients !== undefined) {
    stmtDeleteIngredients.run(id);
    writeIngredients(id, patch.ingredients);
  }

  return stmtGetById.get(id) as RecipeRow;
});

// ---------------------------------------------------------------------------
// Public store
// ---------------------------------------------------------------------------

export const recipeStore = {
  getAll(): Recipe[] {
    return hydrateAll(stmtGetAll.all() as RecipeRow[]);
  },

  getById(id: string): Recipe | undefined {
    const row = stmtGetById.get(id) as RecipeRow | undefined;
    return row ? hydrateOne(row) : undefined;
  },

  exists(id: string): boolean {
    return stmtExists.get(id) !== undefined;
  },

  add(recipe: Omit<Recipe, 'id'>): Recipe {
    const id = allocateId('recipes');
    addRecipeTx(id, recipe);
    return hydrateOne(stmtGetById.get(id) as RecipeRow);
  },

  updateRating(id: string, rating: number): Recipe | undefined {
    if (stmtUpdateRating.run(rating, id).changes === 0) return undefined;
    return hydrateOne(stmtGetById.get(id) as RecipeRow);
  },

  update(id: string, patch: RecipeUpdate): Recipe | undefined {
    const row = updateRecipeTx(id, patch);
    return row ? hydrateOne(row) : undefined;
  },

  remove(id: string): boolean {
    return stmtDeleteRecipe.run(id).changes > 0;
  },

  /** Reset to seed data — used in tests */
  reset(): void {
    resetDb();
  },
};
