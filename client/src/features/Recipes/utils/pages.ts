import type { InfiniteData } from '@tanstack/react-query';
import type { Recipe, RecipePage } from '../types/index.js';

/**
 * Joins the loaded pages into one list. A recipe created or deleted while the
 * list is scrolled shifts every later offset, so a refetched page can repeat a
 * recipe from the page before it; each id is kept once, at its first position.
 */
export function flattenPages(pages: RecipePage[]): { recipes: Recipe[]; total: number } {
  const seen = new Set<string>();
  const recipes: Recipe[] = [];
  for (const page of pages) {
    for (const recipe of page.items) {
      if (seen.has(recipe.id)) continue;
      seen.add(recipe.id);
      recipes.push(recipe);
    }
  }
  return { recipes, total: pages.at(-1)?.total ?? 0 };
}

/** The cached shape of the paged recipe list. */
export type RecipePages = InfiniteData<RecipePage, number>;

/** Puts an updated recipe in place on whichever loaded page holds it. */
export function replaceRecipeInPages(
  data: RecipePages | undefined,
  updated: Recipe,
): RecipePages | undefined {
  if (data === undefined) return undefined;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((r) => (r.id === updated.id ? updated : r)),
    })),
  };
}

/** Drops a deleted recipe from the loaded pages and counts it out of the total. */
export function removeRecipeFromPages(
  data: RecipePages | undefined,
  id: string,
): RecipePages | undefined {
  if (data === undefined) return undefined;
  const present = data.pages.some((page) => page.items.some((r) => r.id === id));
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((r) => r.id !== id),
      total: present ? page.total - 1 : page.total,
    })),
  };
}
