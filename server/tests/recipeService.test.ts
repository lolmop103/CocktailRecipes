import { describe, it, expect } from 'vitest';
import { filterAndSort } from '../src/services/recipeService.js';
import type { Recipe } from '@cocktail/shared';

const recipes: Recipe[] = [
  {
    id: '1',
    name: 'Mojito',
    ingredients: [
      { name: 'white rum' },
      { name: 'fresh lime juice' },
      { name: 'sugar syrup' },
      { name: 'fresh mint' },
      { name: 'soda water' },
    ],
    rating: 4,
    isMocktail: false,
  },
  {
    id: '2',
    name: 'Daiquiri',
    ingredients: [{ name: 'white rum' }, { name: 'fresh lime juice' }, { name: 'sugar syrup' }],
    rating: 5,
    isMocktail: false,
  },
  {
    id: '3',
    name: 'Negroni',
    ingredients: [{ name: 'gin' }, { name: 'sweet vermouth' }, { name: 'Campari' }],
    rating: 5,
    isMocktail: false,
  },
  {
    id: '4',
    name: 'Espresso Martini',
    ingredients: [
      { name: 'vodka' },
      { name: 'espresso' },
      { name: 'coffee liqueur' },
      { name: 'sugar syrup' },
    ],
    // no rating
    isMocktail: false,
  },
];

describe('filterAndSort', () => {
  describe('search', () => {
    it('search_matchesSubstring_returnsMatches', () => {
      const result = filterAndSort(recipes, { search: 'mo' });
      expect(result.map((r) => r.name)).toEqual(['Mojito']);
    });

    it('search_caseInsensitive_returnsMatches', () => {
      const result = filterAndSort(recipes, { search: 'DAIQUIRI' });
      expect(result.map((r) => r.name)).toEqual(['Daiquiri']);
    });

    it('search_noMatch_returnsEmpty', () => {
      const result = filterAndSort(recipes, { search: 'zzz' });
      expect(result).toHaveLength(0);
    });
  });

  describe('ingredient include', () => {
    it('ingredients_singleMatch_returnsRecipesWithIngredient', () => {
      const result = filterAndSort(recipes, { ingredients: ['rum'] });
      const names = result.map((r) => r.name);
      expect(names).toContain('Mojito');
      expect(names).toContain('Daiquiri');
      expect(names).not.toContain('Negroni');
    });

    it('ingredients_multipleAnd_returnsOnlyRecipesWithAll', () => {
      const result = filterAndSort(recipes, { ingredients: ['rum', 'mint'] });
      expect(result.map((r) => r.name)).toEqual(['Mojito']);
    });

    it('ingredients_noMatch_returnsEmpty', () => {
      const result = filterAndSort(recipes, { ingredients: ['tequila'] });
      expect(result).toHaveLength(0);
    });
  });

  describe('ingredient exclude', () => {
    it('excludeIngredients_excludesRecipesWithIngredient', () => {
      const result = filterAndSort(recipes, { excludeIngredients: ['rum'] });
      const names = result.map((r) => r.name);
      expect(names).not.toContain('Mojito');
      expect(names).not.toContain('Daiquiri');
      expect(names).toContain('Negroni');
    });

    it('excludeIngredients_multipleExcludes_excludesAll', () => {
      const result = filterAndSort(recipes, { excludeIngredients: ['rum', 'vodka'] });
      const names = result.map((r) => r.name);
      expect(names).not.toContain('Mojito');
      expect(names).not.toContain('Daiquiri');
      expect(names).not.toContain('Espresso Martini');
      expect(names).toContain('Negroni');
    });
  });

  describe('minRating', () => {
    it('minRating_filtersOutBelowThreshold', () => {
      const result = filterAndSort(recipes, { minRating: 5 });
      expect(result.map((r) => r.name)).toEqual(expect.arrayContaining(['Daiquiri', 'Negroni']));
      expect(result.map((r) => r.name)).not.toContain('Mojito');
    });

    it('minRating_excludesUnratedRecipes', () => {
      const result = filterAndSort(recipes, { minRating: 1 });
      expect(result.map((r) => r.name)).not.toContain('Espresso Martini');
    });

    it('minRating_notSet_includesUnrated', () => {
      const result = filterAndSort(recipes, {});
      expect(result.map((r) => r.name)).toContain('Espresso Martini');
    });
  });

  describe('sort', () => {
    it('sortBy_name_asc_returnsAlphabetical', () => {
      const result = filterAndSort(recipes, { sortBy: 'name', sortOrder: 'asc' });
      const names = result.map((r) => r.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('sortBy_name_desc_returnsReverseAlphabetical', () => {
      const result = filterAndSort(recipes, { sortBy: 'name', sortOrder: 'desc' });
      const names = result.map((r) => r.name);
      expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
    });

    it('sortBy_rating_desc_highestFirst', () => {
      const result = filterAndSort(recipes, { sortBy: 'rating', sortOrder: 'desc' });
      // unrated should be last
      const lastRecipe = result[result.length - 1];
      expect(lastRecipe?.rating).toBeUndefined();
      // first two should have rating 5
      expect(result[0]?.rating).toBe(5);
      expect(result[1]?.rating).toBe(5);
    });

    it('sortBy_ingredientCount_asc_fewestFirst', () => {
      const result = filterAndSort(recipes, { sortBy: 'ingredientCount', sortOrder: 'asc' });
      const counts = result.map((r) => r.ingredients.length);
      for (let i = 0; i < counts.length - 1; i++) {
        expect(counts[i]!).toBeLessThanOrEqual(counts[i + 1]!);
      }
    });
  });

  describe('combined filters', () => {
    it('search_and_ingredient_returnsIntersection', () => {
      const result = filterAndSort(recipes, { search: 'i', ingredients: ['rum'] });
      const names = result.map((r) => r.name);
      // "Mojito" and "Daiquiri" both match "i" AND contain rum
      expect(names).toContain('Mojito');
      expect(names).toContain('Daiquiri');
      expect(names).not.toContain('Negroni');
    });
  });
});
