import {
  MAX_COLLECTION_ID_LENGTH,
  MAX_FILTER_TERMS,
  MAX_SEARCH_LENGTH,
  MAX_TERM_LENGTH,
} from '@cocktail/shared/limits';
import type { RecipeFilters } from '../types/index.js';

const DIGITS = /^\d+$/;

/** Drops blank, over-long and case-insensitive repeated terms, then keeps the first allowed. */
function clampTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const term of terms) {
    const key = term.trim().toLowerCase();
    if (key === '' || term.length > MAX_TERM_LENGTH || seen.has(key)) continue;
    seen.add(key);
    kept.push(term);
  }
  return kept.slice(0, MAX_FILTER_TERMS);
}

/**
 * Brings filters read from the URL within the server's limits, so an old
 * bookmark or a hand-edited link still opens a working page instead of a 400.
 */
export function clampFilters(filters: RecipeFilters): RecipeFilters {
  const { collectionId, ...rest } = filters;
  const validCollection =
    collectionId !== undefined &&
    DIGITS.test(collectionId) &&
    collectionId.length <= MAX_COLLECTION_ID_LENGTH;

  return {
    ...rest,
    search: filters.search.slice(0, MAX_SEARCH_LENGTH),
    ingredients: clampTerms(filters.ingredients),
    excludeIngredients: clampTerms(filters.excludeIngredients),
    ...(validCollection ? { collectionId } : {}),
  };
}
