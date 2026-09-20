import type {
  CreateRecipeInput,
  Recipe,
  RecipeFilters,
  RecipeQuery,
  UpdateRecipeInput,
} from '@cocktail/shared';
import { recipeStore } from '../data/recipeStore.js';
import { ingredientMetaStore } from '../data/ingredientMetaStore.js';
import { collectionStore } from '../data/collectionStore.js';
import { NotFoundError } from '../lib/errors.js';

// ---------------------------------------------------------------------------
// Query translation
// ---------------------------------------------------------------------------

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Turns the wire format (comma-separated lists, string booleans) into filters. */
export function toFilters(query: RecipeQuery): RecipeFilters {
  return {
    ...(query.search !== undefined && { search: query.search }),
    ...(query.ingredients !== undefined && { ingredients: splitList(query.ingredients) }),
    ...(query.excludeIngredients !== undefined && {
      excludeIngredients: splitList(query.excludeIngredients),
    }),
    ...(query.onlySelectedIngredients === 'true' && { onlySelectedIngredients: true }),
    ...(query.minRating !== undefined && { minRating: query.minRating }),
    ...(query.sortBy !== undefined && { sortBy: query.sortBy }),
    ...(query.sortOrder !== undefined && { sortOrder: query.sortOrder }),
    ...(query.isMocktail !== undefined && { isMocktail: query.isMocktail === 'true' }),
  };
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

/** Keeps the ingredient vocabulary in step with whatever a recipe introduced. */
function registerIngredients(recipe: Recipe): void {
  for (const ingredient of recipe.ingredients) {
    ingredientMetaStore.ensureExists(ingredient.name);
  }
}

export const recipeService = {
  list(query: RecipeQuery): Recipe[] {
    return recipeStore.query(toFilters(query), query.collectionId);
  },

  getById(id: string): Recipe {
    const recipe = recipeStore.getById(id);
    if (!recipe) throw new NotFoundError('Recipe', id);
    return recipe;
  },

  create(input: CreateRecipeInput): Recipe {
    const { rating, instructions, glassType, tags, ...required } = input;

    const created = recipeStore.add({
      ...required,
      ...(instructions !== undefined && { instructions }),
      ...(glassType !== undefined && { glassType }),
      ...(tags !== undefined && { tags }),
      ...(rating !== undefined && { rating }),
    });

    registerIngredients(created);
    return created;
  },

  update(id: string, input: UpdateRecipeInput): Recipe {
    // Drop keys the client did not send, so "absent" stays distinct from "null".
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as UpdateRecipeInput;

    const updated = recipeStore.update(id, patch);
    if (!updated) throw new NotFoundError('Recipe', id);

    registerIngredients(updated);
    return updated;
  },

  rate(id: string, rating: number): Recipe {
    const updated = recipeStore.updateRating(id, rating);
    if (!updated) throw new NotFoundError('Recipe', id);
    return updated;
  },

  remove(id: string): void {
    if (!recipeStore.remove(id)) throw new NotFoundError('Recipe', id);
    // Membership rows would otherwise outlive the recipe they point at.
    collectionStore.removeRecipeFromAll(id);
  },
};
