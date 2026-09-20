import { describe, it, expect } from 'vitest';
import {
  emptyForm,
  formFromRecipe,
  toCreatePayload,
  toUpdatePayload,
} from '../src/features/Recipes/components/recipeForm.js';
import type { Recipe } from '../src/features/Recipes/types/index.js';

const mojito: Recipe = {
  id: '1',
  name: 'Mojito',
  ingredients: [
    { name: 'white rum', amount: '60ml' },
    { name: 'fresh mint', amount: '10 leaves' },
  ],
  instructions: 'Muddle, build, top with soda.',
  glassType: 'highball',
  tags: ['refreshing'],
  isMocktail: false,
};

describe('formFromRecipe', () => {
  it('splits_numericAmount_fromUnit', () => {
    const form = formFromRecipe(mojito);

    expect(form.ingredients[0]).toMatchObject({ name: 'white rum', amount: '60', unit: 'ml' });
  });

  it('keeps_nonNumericAmount_verbatim', () => {
    const form = formFromRecipe(mojito);

    expect(form.ingredients[1]).toMatchObject({ name: 'fresh mint', amount: '10 leaves' });
  });

  it('assigns_stableKeys_perRow', () => {
    const form = formFromRecipe(mojito);
    const keys = form.ingredients.map((row) => row.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('toCreatePayload', () => {
  it('omits_emptyOptionalFields', () => {
    const form = emptyForm(false);
    form.name = 'Water';
    form.ingredients[0] = { ...form.ingredients[0]!, name: 'water' };

    const payload = toCreatePayload(form);

    expect(payload).not.toHaveProperty('instructions');
    expect(payload).not.toHaveProperty('glassType');
    expect(payload).not.toHaveProperty('tags');
  });

  it('recombines_amountAndUnit', () => {
    const form = formFromRecipe(mojito);

    expect(toCreatePayload(form).ingredients[0]).toEqual({ name: 'white rum', amount: '60ml' });
  });
});

describe('toUpdatePayload', () => {
  it('sends_null_forClearedFields', () => {
    const form = formFromRecipe(mojito);
    form.instructions = '';
    form.glassType = '';
    form.tags = [];

    const payload = toUpdatePayload(form);

    // Omitting these would mean "leave unchanged" and the deletion would be lost.
    expect(payload.instructions).toBeNull();
    expect(payload.glassType).toBeNull();
    expect(payload.tags).toBeNull();
  });

  it('sends_values_forPopulatedFields', () => {
    const payload = toUpdatePayload(formFromRecipe(mojito));

    expect(payload.instructions).toBe('Muddle, build, top with soda.');
    expect(payload.glassType).toBe('highball');
    expect(payload.tags).toEqual(['refreshing']);
  });

  it('trims_whitespaceOnlyFields_toNull', () => {
    const form = formFromRecipe(mojito);
    form.instructions = '   ';

    expect(toUpdatePayload(form).instructions).toBeNull();
  });
});
