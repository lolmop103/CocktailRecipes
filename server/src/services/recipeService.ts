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
// Filtering and sorting
// ---------------------------------------------------------------------------

function ingredientNames(recipe: Recipe): string[] {
  return recipe.ingredients.map((i) => i.name.toLowerCase());
}

export function filterAndSort(recipes: Recipe[], filters: RecipeFilters): Recipe[] {
  let result = recipes.slice();

  if (filters.search) {
    const term = filters.search.toLowerCase();
    result = result.filter((r) => r.name.toLowerCase().includes(term));
  }

  // Include: the recipe must contain ALL of the selected ingredients.
  if (filters.ingredients && filters.ingredients.length > 0) {
    const required = filters.ingredients.map((i) => i.toLowerCase());
    result = result.filter((r) => {
      const names = ingredientNames(r);
      return required.every((req) => names.some((n) => n.includes(req)));
    });
  }

  // Exclude: the recipe must contain NONE of them.
  if (filters.excludeIngredients && filters.excludeIngredients.length > 0) {
    const excluded = filters.excludeIngredients.map((i) => i.toLowerCase());
    result = result.filter((r) => {
      const names = ingredientNames(r);
      return excluded.every((ex) => !names.some((n) => n.includes(ex)));
    });
  }

  // "Only these": every ingredient in the recipe must be covered by a selection.
  if (filters.onlySelectedIngredients && filters.ingredients && filters.ingredients.length > 0) {
    const allowed = filters.ingredients.map((i) => i.toLowerCase());
    result = result.filter((r) =>
      ingredientNames(r).every((name) => allowed.some((selected) => name.includes(selected))),
    );
  }

  if (filters.minRating !== undefined) {
    const min = filters.minRating;
    result = result.filter((r) => r.rating !== undefined && r.rating >= min);
  }

  if (filters.isMocktail !== undefined) {
    result = result.filter((r) => r.isMocktail === filters.isMocktail);
  }

  const order = filters.sortOrder === 'desc' ? -1 : 1;

  result.sort((a, b) => {
    switch (filters.sortBy) {
      case 'rating': {
        // Unrated sorts to the bottom in both directions, which reads as
        // "no opinion yet" rather than "worst".
        const ra = a.rating ?? -Infinity;
        const rb = b.rating ?? -Infinity;
        if (ra === rb) return a.name.localeCompare(b.name);
        return (ra - rb) * order;
      }
      case 'ingredientCount': {
        const diff = a.ingredients.length - b.ingredients.length;
        if (diff !== 0) return diff * order;
        return a.name.localeCompare(b.name);
      }
      case 'name':
      default:
        return a.name.localeCompare(b.name) * order;
    }
  });

  return result;
}

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
    let source = recipeStore.getAll();

    if (query.collectionId !== undefined) {
      const collection = collectionStore.getById(query.collectionId);
      const ids = new Set(collection?.recipeIds ?? []);
      source = source.filter((r) => ids.has(r.id));
    }

    return filterAndSort(source, toFilters(query));
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
