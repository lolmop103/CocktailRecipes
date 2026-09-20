import { z } from 'zod';

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export const SORT_BY = ['name', 'rating', 'ingredientCount'] as const;
export const SORT_ORDER = ['asc', 'desc'] as const;
export const UNITS = ['ml', 'oz'] as const;

export const ingredientSchema = z.object({
  name: z.string().min(1),
  amount: z.string().optional(),
});

export const recipeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  ingredients: z.array(ingredientSchema),
  instructions: z.string().optional(),
  glassType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING).optional(),
  isMocktail: z.boolean(),
});

export const createRecipeSchema = z.object({
  name: z.string().min(1),
  ingredients: z.array(ingredientSchema).min(1),
  instructions: z.string().optional(),
  glassType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING).optional(),
  isMocktail: z.boolean().default(false),
});

/**
 * Partial update. The three states are deliberately distinct: an absent key
 * leaves the field untouched, an explicit `null` clears it, and a value
 * replaces it. Without the `null` case there is no way to erase an optional
 * field once it has been set.
 */
export const updateRecipeSchema = z.object({
  name: z.string().min(1).optional(),
  ingredients: z.array(ingredientSchema).min(1).optional(),
  instructions: z.string().nullable().optional(),
  glassType: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING).nullable().optional(),
  isMocktail: z.boolean().optional(),
});

export const ratingSchema = z.object({
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
});

/** Filters as they travel over the wire: comma-separated lists, string booleans. */
export const recipeQuerySchema = z.object({
  search: z.string().optional(),
  ingredients: z.string().optional(),
  excludeIngredients: z.string().optional(),
  onlySelectedIngredients: z.string().optional(),
  minRating: z.coerce.number().int().min(MIN_RATING).max(MAX_RATING).optional(),
  sortBy: z.enum(SORT_BY).optional(),
  sortOrder: z.enum(SORT_ORDER).optional(),
  isMocktail: z.string().optional(),
  collectionId: z.string().optional(),
});

export type Ingredient = z.infer<typeof ingredientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeQuery = z.infer<typeof recipeQuerySchema>;
export type SortBy = (typeof SORT_BY)[number];
export type SortOrder = (typeof SORT_ORDER)[number];
export type Unit = (typeof UNITS)[number];

/** Filters after parsing, as the domain works with them. */
export interface RecipeFilters {
  search?: string | undefined;
  ingredients?: string[] | undefined;
  excludeIngredients?: string[] | undefined;
  onlySelectedIngredients?: boolean | undefined;
  minRating?: number | undefined;
  sortBy?: SortBy | undefined;
  sortOrder?: SortOrder | undefined;
  isMocktail?: boolean | undefined;
}
