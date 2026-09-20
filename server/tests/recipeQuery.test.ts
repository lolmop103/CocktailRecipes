/**
 * Filtering and sorting now happen in SQL, so these run against the real
 * in-memory database and the seeded catalogue rather than a pure function over
 * an array. Every case here was previously asserted against `filterAndSort`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recipeStore } from '../src/data/recipeStore.js';
import { collectionStore } from '../src/data/collectionStore.js';
import type { RecipeFilters } from '@cocktail/shared';

function names(filters: RecipeFilters, collectionId?: string): string[] {
  return recipeStore.query(filters, collectionId).map((r) => r.name);
}

beforeEach(() => {
  recipeStore.reset();
});

describe('search', () => {
  it('search_matchesSubstring_returnsMatches', () => {
    expect(names({ search: 'mo' })).toEqual(['Mojito']);
  });

  it('search_caseInsensitive_returnsMatches', () => {
    expect(names({ search: 'NEGRONI' })).toEqual(['Negroni']);
  });

  it('search_noMatch_returnsEmpty', () => {
    expect(names({ search: 'zzzz' })).toEqual([]);
  });
});

describe('ingredient include', () => {
  it('ingredients_singleMatch_returnsRecipesWithIngredient', () => {
    expect(names({ ingredients: ['sweet vermouth'] })).toEqual(['Negroni']);
  });

  it('ingredients_substringMatch_alsoMatchesLongerNames', () => {
    // Pre-existing behaviour, preserved by the SQL rewrite: matching is
    // substring-based, so "gin" also matches "ginger beer".
    expect(names({ ingredients: ['gin'] })).toEqual(['Dark & Stormy', 'Negroni']);
  });

  it('ingredients_matchesSubstring_soRumFindsWhiteAndDarkRum', () => {
    expect(names({ ingredients: ['rum'] })).toEqual(['Daiquiri', 'Dark & Stormy', 'Mojito']);
  });

  it('ingredients_multipleAnd_returnsOnlyRecipesWithAll', () => {
    expect(names({ ingredients: ['white rum', 'fresh mint'] })).toEqual(['Mojito']);
  });

  it('ingredients_noMatch_returnsEmpty', () => {
    expect(names({ ingredients: ['unobtainium'] })).toEqual([]);
  });
});

describe('ingredient exclude', () => {
  it('excludeIngredients_excludesRecipesWithIngredient', () => {
    const result = names({ excludeIngredients: ['rum'] });

    expect(result).not.toContain('Mojito');
    expect(result).not.toContain('Daiquiri');
    expect(result).toContain('Negroni');
  });

  it('excludeIngredients_multipleExcludes_excludesAll', () => {
    const result = names({ excludeIngredients: ['rum', 'gin'] });

    expect(result).not.toContain('Mojito');
    expect(result).not.toContain('Negroni');
  });

  it('excludeIngredients_combinedWithInclude_appliesBoth', () => {
    expect(names({ ingredients: ['fresh lime juice'], excludeIngredients: ['rum'] })).toEqual([
      'Margarita',
    ]);
  });
});

describe('onlySelectedIngredients', () => {
  it('onlySelected_keepsRecipesFullyCoveredByTheSelection', () => {
    const result = names({
      ingredients: ['white rum', 'fresh lime juice', 'sugar syrup'],
      onlySelectedIngredients: true,
    });

    // Mojito also needs mint and soda water, so it is not makeable.
    expect(result).toEqual(['Daiquiri']);
  });

  it('onlySelected_withoutTheFlag_allowsExtraIngredients', () => {
    const result = names({ ingredients: ['white rum', 'fresh lime juice', 'sugar syrup'] });

    expect(result).toEqual(['Daiquiri', 'Mojito']);
  });

  it('onlySelected_ignoredWhenNothingSelected', () => {
    expect(names({ onlySelectedIngredients: true })).toHaveLength(8);
  });
});

describe('minRating', () => {
  it('minRating_filtersOutBelowThreshold', () => {
    expect(names({ minRating: 5 })).toEqual(['Daiquiri', 'Negroni']);
  });

  it('minRating_excludesUnratedRecipes', () => {
    expect(names({ minRating: 1 })).not.toContain('Espresso Martini');
  });

  it('minRating_notSet_includesUnrated', () => {
    expect(names({})).toContain('Espresso Martini');
  });
});

describe('isMocktail', () => {
  it('isMocktail_true_returnsNoneFromTheSeededCatalogue', () => {
    expect(names({ isMocktail: true })).toEqual([]);
  });

  it('isMocktail_false_returnsEveryCocktail', () => {
    expect(names({ isMocktail: false })).toHaveLength(8);
  });
});

describe('collection filter', () => {
  it('collectionId_narrowsToItsMembers', () => {
    const collection = collectionStore.create('Party');
    collectionStore.addRecipe(collection.id, '2');

    expect(names({}, collection.id)).toEqual(['Negroni']);
  });

  it('collectionId_unknown_returnsEmpty', () => {
    expect(names({}, 'no-such-collection')).toEqual([]);
  });

  it('collectionId_combinesWithOtherFilters', () => {
    const collection = collectionStore.create('Party');
    collectionStore.addRecipe(collection.id, '1');
    collectionStore.addRecipe(collection.id, '2');

    expect(names({ ingredients: ['gin'] }, collection.id)).toEqual(['Negroni']);
  });
});

describe('sort', () => {
  it('sortBy_name_asc_returnsAlphabetical', () => {
    expect(names({ sortBy: 'name', sortOrder: 'asc' })).toEqual([
      'Aperol Spritz',
      'Daiquiri',
      'Dark & Stormy',
      'Espresso Martini',
      'Margarita',
      'Mojito',
      'Negroni',
      'Whiskey Sour',
    ]);
  });

  it('sortBy_name_desc_returnsReverseAlphabetical', () => {
    expect(names({ sortBy: 'name', sortOrder: 'desc' })[0]).toBe('Whiskey Sour');
  });

  it('sortBy_rating_desc_highestFirst_unratedLast', () => {
    const result = recipeStore.query({ sortBy: 'rating', sortOrder: 'desc' });

    expect(result[0]?.rating).toBe(5);
    expect(result[result.length - 1]?.rating).toBeUndefined();
  });

  it('sortBy_rating_asc_treatsUnratedAsLowest', () => {
    const result = recipeStore.query({ sortBy: 'rating', sortOrder: 'asc' });

    // Ascending is worst-first, and an unjudged recipe sorts below a bad one.
    expect(result[0]?.rating).toBeUndefined();
    expect(result[result.length - 1]?.rating).toBe(5);
  });

  it('sortBy_rating_tiesBreakByNameAscending_inBothDirections', () => {
    const desc = recipeStore
      .query({ sortBy: 'rating', sortOrder: 'desc' })
      .filter((r) => r.rating === 5)
      .map((r) => r.name);

    expect(desc).toEqual(['Daiquiri', 'Negroni']);
  });

  it('sortBy_ingredientCount_asc_fewestFirst', () => {
    const result = recipeStore.query({ sortBy: 'ingredientCount', sortOrder: 'asc' });

    expect(result[0]?.ingredients).toHaveLength(3);
    expect(result[result.length - 1]?.ingredients).toHaveLength(5);
  });

  it('sortBy_ingredientCount_desc_mostFirst', () => {
    const result = recipeStore.query({ sortBy: 'ingredientCount', sortOrder: 'desc' });

    expect(result[0]?.name).toBe('Mojito');
  });

  it('defaultsTo_nameAscending_whenNoSortGiven', () => {
    expect(names({})[0]).toBe('Aperol Spritz');
  });
});

describe('combined filters', () => {
  it('search_and_ingredient_returnsIntersection', () => {
    expect(names({ search: 'daiq', ingredients: ['white rum'] })).toEqual(['Daiquiri']);
  });

  it('everyFilterAtOnce_narrowsCorrectly', () => {
    const result = names({
      ingredients: ['fresh lime juice'],
      excludeIngredients: ['rum'],
      minRating: 4,
      isMocktail: false,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(result).toEqual(['Margarita']);
  });
});

describe('injection safety', () => {
  it('treats_sqlMetacharactersInSearch_asLiteralText', () => {
    expect(names({ search: "'; DROP TABLE recipes; --" })).toEqual([]);
    // The table is still there.
    expect(names({})).toHaveLength(8);
  });

  it('treats_sqlMetacharactersInIngredients_asLiteralText', () => {
    expect(names({ ingredients: ["' OR 1=1 --"] })).toEqual([]);
  });
});
