/**
 * The client consumes the shared contract as types only, so zod is never
 * bundled into the browser build.
 */
export type {
  Ingredient,
  IngredientMeta,
  Recipe,
  Collection,
  SortBy,
  SortOrder,
  Unit,
} from '@cocktail/shared';

import type { Recipe, SortBy, SortOrder } from '@cocktail/shared';

/** What the create form sends. Optional fields are simply omitted. */
export type CreateRecipePayload = Omit<Recipe, 'id' | 'rating'>;

/**
 * What the edit form sends. `null` clears a field on the server; omitting a key
 * would mean "leave unchanged", which is how a deletion used to get lost.
 */
export interface RecipeUpdatePayload {
  name: string;
  ingredients: Recipe['ingredients'];
  instructions: string | null;
  glassType: string | null;
  tags: string[] | null;
  isMocktail: boolean;
}

/** Filter state as the UI holds it — always populated, unlike the wire format. */
export interface RecipeFilters {
  search: string;
  ingredients: string[];
  excludeIngredients: string[];
  onlySelectedIngredients: boolean;
  minRating: number | undefined;
  sortBy: SortBy;
  sortOrder: SortOrder;
  isMocktail?: boolean;
  collectionId?: string;
}
