import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { recipeQuerySchema } from '@cocktail/shared';
import { createApp } from '../src/app.js';

/** "gin0,gin1,…" — n distinct terms. */
const terms = (n: number) => Array.from({ length: n }, (_, i) => `gin${String(i)}`).join(',');
const parse = (query: Record<string, unknown>) => recipeQuerySchema.safeParse(query);

describe('recipeQuerySchema', () => {
  it('ingredients_twentyTerms_accepted', () => {
    expect(parse({ ingredients: terms(20) }).success).toBe(true);
  });

  it('ingredients_twentyOneTerms_rejected', () => {
    expect(parse({ ingredients: terms(21) }).success).toBe(false);
  });

  it('excludeIngredients_twentyOneTerms_rejected', () => {
    expect(parse({ excludeIngredients: terms(21) }).success).toBe(false);
  });

  it('ingredients_duplicatesAndBlanks_collapsedBeforeCounting', () => {
    const result = parse({ ingredients: `${terms(20)},GIN0, ,gin0` });

    expect(result.success).toBe(true);
    expect(result.data?.ingredients).toHaveLength(20);
  });

  it('ingredients_whitespaceAroundTerms_trimmed', () => {
    const result = parse({ ingredients: ' white rum , lime ' });

    expect(result.data?.ingredients).toEqual(['white rum', 'lime']);
  });

  it('ingredientTerm_sixtyChars_accepted', () => {
    expect(parse({ ingredients: 'a'.repeat(60) }).success).toBe(true);
  });

  it('ingredientTerm_sixtyOneChars_rejected', () => {
    expect(parse({ ingredients: 'a'.repeat(61) }).success).toBe(false);
  });

  it('search_hundredChars_accepted', () => {
    expect(parse({ search: 'a'.repeat(100) }).success).toBe(true);
  });

  it('search_hundredOneChars_rejected', () => {
    expect(parse({ search: 'a'.repeat(101) }).success).toBe(false);
  });

  it('search_array_rejected', () => {
    expect(parse({ search: ['a', 'b'] }).success).toBe(false);
  });

  it('collectionId_nonDigits_rejected', () => {
    expect(parse({ collectionId: '1 OR 1=1' }).success).toBe(false);
  });

  it('collectionId_thirteenDigits_rejected', () => {
    expect(parse({ collectionId: '1'.repeat(13) }).success).toBe(false);
  });

  it('isMocktail_yes_rejected', () => {
    expect(parse({ isMocktail: 'yes' }).success).toBe(false);
  });

  it('isMocktail_false_parsedToBoolean', () => {
    expect(parse({ isMocktail: 'false' }).data?.isMocktail).toBe(false);
  });

  it('onlySelectedIngredients_true_parsedToBoolean', () => {
    expect(parse({ onlySelectedIngredients: 'true' }).data?.onlySelectedIngredients).toBe(true);
  });

  it('emptyQuery_defaultsToEmptyLists', () => {
    const result = parse({});

    expect(result.data?.ingredients).toEqual([]);
    expect(result.data?.excludeIngredients).toEqual([]);
  });
});

describe('LIKE wildcards in filter values', () => {
  it('ingredients_percentTerm_matchesOnlyALiteralPercent', async () => {
    const res = await request(createApp()).get('/api/recipes?ingredients=%25');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('search_underscore_matchesOnlyALiteralUnderscore', async () => {
    const res = await request(createApp()).get('/api/recipes?search=_');

    expect(res.body.items).toEqual([]);
  });
});
