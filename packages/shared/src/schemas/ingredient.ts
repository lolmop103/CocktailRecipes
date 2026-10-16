import { z } from 'zod';
import { INGREDIENT_NAME_MAX } from '../limits.js';

export const ingredientMetaSchema = z.object({
  name: z.string().min(1),
  /** true = alcoholic, false = non-alcoholic, null = not yet classified */
  isAlcoholic: z.boolean().nullable(),
});

export const classifyIngredientSchema = z.object({
  isAlcoholic: z.boolean(),
});

/** The decoded `:name` of `PATCH /api/ingredients/:name`. */
export const ingredientNameParamSchema = z.string().min(1).max(INGREDIENT_NAME_MAX);

export type IngredientMeta = z.infer<typeof ingredientMetaSchema>;
export type ClassifyIngredientInput = z.infer<typeof classifyIngredientSchema>;
