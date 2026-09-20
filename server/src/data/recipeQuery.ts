import type { RecipeFilters, SortBy } from '@cocktail/shared';

export interface CompiledQuery {
  sql: string;
  params: (string | number)[];
}

/**
 * Ingredient matching is substring-based: selecting "rum" is expected to match
 * "white rum" and "dark rum". SQLite's LIKE is case-insensitive for ASCII, so
 * it matches what the UI promises without a lower() call that would defeat the
 * index on recipe_ingredients(name).
 */
const INGREDIENT_LIKE = "ri.name LIKE '%' || ? || '%'";

/**
 * ORDER BY fragments, keyed by sort column.
 *
 * Unrated recipes sort as if rated below 1: first when ascending (worst-first
 * reads as "unjudged before bad"), last when descending. The secondary sort is
 * always name ascending, regardless of direction, so ties are stable.
 *
 * These are lookup values, never interpolated user input — the sort column and
 * direction are both validated against an enum before reaching here.
 */
const ORDER_BY: Record<SortBy, (dir: 'ASC' | 'DESC') => string> = {
  name: (dir) => `r.name COLLATE NOCASE ${dir}`,
  rating: (dir) =>
    `CASE WHEN r.rating IS NULL THEN 0 ELSE r.rating END ${dir}, r.name COLLATE NOCASE ASC`,
  ingredientCount: (dir) =>
    `(SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) ${dir},` +
    ' r.name COLLATE NOCASE ASC',
};

/**
 * Builds the SELECT that applies every filter in SQL rather than loading the
 * whole table and filtering in memory.
 */
export function compileRecipeQuery(filters: RecipeFilters, collectionId?: string): CompiledQuery {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filters.search) {
    where.push("r.name LIKE '%' || ? || '%'");
    params.push(filters.search);
  }

  // Include: the recipe must contain ALL of these, so one EXISTS each.
  for (const ingredient of filters.ingredients ?? []) {
    where.push(
      `EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id = r.id AND ${INGREDIENT_LIKE})`,
    );
    params.push(ingredient);
  }

  // Exclude: the recipe must contain NONE of these.
  for (const ingredient of filters.excludeIngredients ?? []) {
    where.push(
      `NOT EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id = r.id AND ${INGREDIENT_LIKE})`,
    );
    params.push(ingredient);
  }

  // "Only these": no ingredient may fall outside the selected set. Expressed as
  // "there is no ingredient that matches none of the terms".
  const allowed = filters.ingredients ?? [];
  if (filters.onlySelectedIngredients && allowed.length > 0) {
    const covered = allowed.map(() => INGREDIENT_LIKE).join(' OR ');
    where.push(
      'NOT EXISTS (SELECT 1 FROM recipe_ingredients ri' +
        ` WHERE ri.recipe_id = r.id AND NOT (${covered}))`,
    );
    params.push(...allowed);
  }

  if (filters.minRating !== undefined) {
    // An unrated recipe is not "below the threshold", it is unjudged — but a
    // minimum-rating filter is a request for judged recipes, so it is excluded.
    where.push('r.rating IS NOT NULL AND r.rating >= ?');
    params.push(filters.minRating);
  }

  if (filters.isMocktail !== undefined) {
    where.push('r.is_mocktail = ?');
    params.push(filters.isMocktail ? 1 : 0);
  }

  if (collectionId !== undefined) {
    where.push(
      'EXISTS (SELECT 1 FROM collection_recipes cr' +
        ' WHERE cr.recipe_id = r.id AND cr.collection_id = ?)',
    );
    params.push(collectionId);
  }

  const direction = filters.sortOrder === 'desc' ? 'DESC' : 'ASC';
  const orderBy = ORDER_BY[filters.sortBy ?? 'name'](direction);

  const sql =
    'SELECT r.id, r.name, r.instructions, r.glass_type, r.tags, r.rating, r.is_mocktail' +
    ' FROM recipes r' +
    (where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${orderBy}`;

  return { sql, params };
}
