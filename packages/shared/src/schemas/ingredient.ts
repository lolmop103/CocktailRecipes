import { z } from 'zod';

export const ingredientMetaSchema = z.object({
  name: z.string().min(1),
  /** true = alcoholic, false = non-alcoholic, null = not yet classified */
  isAlcoholic: z.boolean().nullable(),
});

export const classifyIngredientSchema = z.object({
  isAlcoholic: z.boolean(),
});

export type IngredientMeta = z.infer<typeof ingredientMetaSchema>;
export type ClassifyIngredientInput = z.infer<typeof classifyIngredientSchema>;
