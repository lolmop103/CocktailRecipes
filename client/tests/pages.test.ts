import { describe, it, expect } from 'vitest';
import {
  flattenPages,
  removeRecipeFromPages,
  replaceRecipeInPages,
} from '../src/features/Recipes/utils/pages.js';
import type { Recipe, RecipePage } from '../src/features/Recipes/types/index.js';

const recipe = (id: string): Recipe => ({ id, name: `R${id}`, ingredients: [], isMocktail: false });
const page = (ids: string[], total: number, nextOffset: number | null): RecipePage => ({
  items: ids.map(recipe),
  total,
  nextOffset,
});

describe('flattenPages', () => {
  it('flattenPages_twoPages_concatenatesInOrder', () => {
    const result = flattenPages([page(['1', '2'], 3, 2), page(['3'], 3, null)]);

    expect(result.recipes.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('flattenPages_overlappingPages_keepsEachIdOnce', () => {
    const result = flattenPages([page(['1', '2'], 4, 2), page(['2', '3'], 4, null)]);

    expect(result.recipes.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('flattenPages_totalFromLastPage', () => {
    const result = flattenPages([page(['1'], 5, 1), page(['2'], 4, null)]);

    expect(result.total).toBe(4);
  });

  it('flattenPages_noPages_emptyAndZero', () => {
    expect(flattenPages([])).toEqual({ recipes: [], total: 0 });
  });
});

describe('cache patches across pages', () => {
  const twoPages = () => ({
    pages: [page(['1', '2'], 3, 2), page(['3'], 3, null)],
    pageParams: [0, 2],
  });

  it('replaceRecipeInPages_updatedRecipe_replacedWherePresent', () => {
    const updated = { ...recipe('3'), rating: 4 };

    const result = replaceRecipeInPages(twoPages(), updated);

    expect(result?.pages[1]?.items[0]).toEqual(updated);
    expect(result?.pages[0]?.items.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('removeRecipeFromPages_deletedId_removedAndTotalsReduced', () => {
    const result = removeRecipeFromPages(twoPages(), '2');

    expect(result?.pages.flatMap((p) => p.items.map((r) => r.id))).toEqual(['1', '3']);
    expect(result?.pages.map((p) => p.total)).toEqual([2, 2]);
  });

  it('removeRecipeFromPages_noCache_undefined', () => {
    expect(removeRecipeFromPages(undefined, '2')).toBeUndefined();
  });
});
