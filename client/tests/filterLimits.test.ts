import { describe, it, expect } from 'vitest';
import { clampFilters } from '../src/features/Recipes/utils/filterLimits.js';
import { DEFAULT_FILTERS } from '../src/features/Recipes/hooks/useFilterParams.js';

const names = (n: number) => Array.from({ length: n }, (_, i) => `gin${String(i)}`);

describe('clampFilters', () => {
  it('clampFilters_25Ingredients_keepsFirst20', () => {
    const result = clampFilters({ ...DEFAULT_FILTERS, ingredients: names(25) });

    expect(result.ingredients).toEqual(names(20));
  });

  it('clampFilters_25Excluded_keepsFirst20', () => {
    const result = clampFilters({ ...DEFAULT_FILTERS, excludeIngredients: names(25) });

    expect(result.excludeIngredients).toHaveLength(20);
  });

  it('clampFilters_duplicatesDifferingInCase_countedOnce', () => {
    const result = clampFilters({ ...DEFAULT_FILTERS, ingredients: ['Gin', 'gin', 'rum'] });

    expect(result.ingredients).toEqual(['Gin', 'rum']);
  });

  it('clampFilters_overlongTerm_dropped', () => {
    const result = clampFilters({ ...DEFAULT_FILTERS, ingredients: ['a'.repeat(61), 'rum'] });

    expect(result.ingredients).toEqual(['rum']);
  });

  it('clampFilters_longSearch_truncatedTo100', () => {
    const result = clampFilters({ ...DEFAULT_FILTERS, search: 'a'.repeat(150) });

    expect(result.search).toHaveLength(100);
  });

  it('clampFilters_nonDigitCollectionId_dropped', () => {
    const result = clampFilters({ ...DEFAULT_FILTERS, collectionId: '1 OR 1=1' });

    expect(result).not.toHaveProperty('collectionId');
  });

  it('clampFilters_validCollectionId_kept', () => {
    const result = clampFilters({ ...DEFAULT_FILTERS, collectionId: '12' });

    expect(result.collectionId).toBe('12');
  });
});
