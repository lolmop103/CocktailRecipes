import type { IngredientMeta } from '@cocktail/shared';
import { ingredientMetaStore } from '../data/ingredientMetaStore.js';

export const ingredientService = {
  list(): IngredientMeta[] {
    return ingredientMetaStore.getAll();
  },

  classify(name: string, isAlcoholic: boolean): IngredientMeta {
    return ingredientMetaStore.setAlcoholic(name, isAlcoholic);
  },
};
