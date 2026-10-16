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
