import { z } from 'zod';
import {
  AMOUNT_MAX,
  GLASS_TYPE_MAX,
  INGREDIENT_NAME_MAX,
  INGREDIENTS_MAX,
  INSTRUCTIONS_MAX,
  MAX_COLLECTION_ID_LENGTH,
  MAX_FILTER_TERMS,
  MAX_OFFSET,
  MAX_SEARCH_LENGTH,
  MAX_TERM_LENGTH,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  RECIPE_NAME_MAX,
  TAG_LENGTH_MAX,
  TAGS_MAX,
} from '../limits.js';

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export const SORT_BY = ['name', 'rating', 'ingredientCount'] as const;
export const SORT_ORDER = ['asc', 'desc'] as const;
export const UNITS = ['ml', 'oz'] as const;

export const ingredientSchema = z.object({
  name: z.string().min(1).max(INGREDIENT_NAME_MAX),
  amount: z.string().max(AMOUNT_MAX).optional(),
});

// Field schemas shared by create and update, so both paths enforce one set of limits.
const recipeName = z.string().min(1).max(RECIPE_NAME_MAX);
const ingredientList = z.array(ingredientSchema).min(1).max(INGREDIENTS_MAX);
const instructions = z.string().max(INSTRUCTIONS_MAX);
const glassType = z.string().max(GLASS_TYPE_MAX);
const tagList = z.array(z.string().min(1).max(TAG_LENGTH_MAX)).max(TAGS_MAX);

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
  name: recipeName,
  ingredients: ingredientList,
  instructions: instructions.optional(),
  glassType: glassType.optional(),
  tags: tagList.optional(),
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
  name: recipeName.optional(),
  ingredients: ingredientList.optional(),
  instructions: instructions.nullable().optional(),
  glassType: glassType.nullable().optional(),
  tags: tagList.nullable().optional(),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING).nullable().optional(),
  isMocktail: z.boolean().optional(),
});

export const ratingSchema = z.object({
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
});

/** Splits a comma-separated list, trimming, dropping blanks and case-insensitive repeats. */
function splitTerms(value: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of value.split(',')) {
    const term = raw.trim();
    const key = term.toLowerCase();
    if (term !== '' && !seen.has(key)) {
      seen.add(key);
      terms.push(term);
    }
  }
  return terms;
}

/**
 * A comma-separated ingredient list, capped after de-duplication. The raw
 * string is bounded first so the split itself cannot be made expensive.
 */
const termListParam = z
  .string()
  .max(MAX_FILTER_TERMS * (MAX_TERM_LENGTH + 1))
  .transform(splitTerms)
  .pipe(z.array(z.string().max(MAX_TERM_LENGTH)).max(MAX_FILTER_TERMS))
  .default([]);

const booleanParam = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

/**
 * Filters as they travel over the wire — comma-separated lists, string
 * booleans — parsed into the shape the query runs on. Every field is bounded:
 * a request over a limit is a 400, never a slow query.
 */
export const recipeQuerySchema = z.object({
  search: z.string().max(MAX_SEARCH_LENGTH).optional(),
  ingredients: termListParam,
  excludeIngredients: termListParam,
  onlySelectedIngredients: booleanParam,
  minRating: z.coerce.number().int().min(MIN_RATING).max(MAX_RATING).optional(),
  sortBy: z.enum(SORT_BY).optional(),
  sortOrder: z.enum(SORT_ORDER).optional(),
  isMocktail: booleanParam,
  collectionId: z.string().regex(/^\d+$/).max(MAX_COLLECTION_ID_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  offset: z.coerce.number().int().min(0).max(MAX_OFFSET).default(0),
});

/** One page of the recipe list. `nextOffset` is null on the last page. */
export interface RecipePage {
  items: Recipe[];
  total: number;
  nextOffset: number | null;
}

export type Ingredient = z.infer<typeof ingredientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
/** The parsed query: the filters plus the optional collection to scope them to. */
export type RecipeQuery = z.output<typeof recipeQuerySchema>;
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
