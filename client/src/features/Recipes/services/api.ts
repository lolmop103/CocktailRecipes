import { PAGE_SIZE_DEFAULT } from '@cocktail/shared/limits';
import { jsonInit, request } from '@/lib/http.js';
import type {
  Recipe,
  RecipePage,
  RecipeFilters,
  IngredientMeta,
  Collection,
  RecipeUpdatePayload,
  CreateRecipePayload,
} from '../types/index.js';

export { ApiError } from '@/lib/http.js';

const BASE = '/api/recipes';

function buildQuery(filters: RecipeFilters, offset: number): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.ingredients.length > 0) params.set('ingredients', filters.ingredients.join(','));
  if (filters.excludeIngredients.length > 0) {
    params.set('excludeIngredients', filters.excludeIngredients.join(','));
  }
  if (filters.onlySelectedIngredients && filters.ingredients.length > 0) {
    params.set('onlySelectedIngredients', 'true');
  }
  if (filters.minRating !== undefined) params.set('minRating', String(filters.minRating));
  params.set('sortBy', filters.sortBy);
  params.set('sortOrder', filters.sortOrder);
  if (filters.isMocktail !== undefined) params.set('isMocktail', String(filters.isMocktail));
  if (filters.collectionId !== undefined) params.set('collectionId', filters.collectionId);
  params.set('limit', String(PAGE_SIZE_DEFAULT));
  params.set('offset', String(offset));
  return params.toString();
}

export const recipesApi = {
  /** One page of recipes, starting at `offset`. */
  list(filters: RecipeFilters, offset = 0, signal?: AbortSignal): Promise<RecipePage> {
    return request<RecipePage>(
      `${BASE}?${buildQuery(filters, offset)}`,
      signal ? { signal } : undefined,
    );
  },

  get(id: string): Promise<Recipe> {
    return request<Recipe>(`${BASE}/${id}`);
  },

  create(payload: CreateRecipePayload): Promise<Recipe> {
    return request<Recipe>(BASE, jsonInit('POST', payload));
  },

  rate(id: string, rating: number): Promise<Recipe> {
    return request<Recipe>(`${BASE}/${id}/rating`, jsonInit('PATCH', { rating }));
  },

  update(id: string, payload: RecipeUpdatePayload): Promise<Recipe> {
    return request<Recipe>(`${BASE}/${id}`, jsonInit('PATCH', payload));
  },

  delete(id: string): Promise<void> {
    return request<void>(`${BASE}/${id}`, { method: 'DELETE' });
  },

  getIngredients(): Promise<IngredientMeta[]> {
    return request<IngredientMeta[]>('/api/ingredients');
  },

  updateIngredientMeta(name: string, isAlcoholic: boolean): Promise<IngredientMeta> {
    return request<IngredientMeta>(
      `/api/ingredients/${encodeURIComponent(name)}`,
      jsonInit('PATCH', { isAlcoholic }),
    );
  },

  // --- Collections ---
  getCollections(): Promise<Collection[]> {
    return request<Collection[]>('/api/collections');
  },

  createCollection(name: string): Promise<Collection> {
    return request<Collection>('/api/collections', jsonInit('POST', { name }));
  },

  addToCollection(collectionId: string, recipeId: string): Promise<Collection> {
    return request<Collection>(`/api/collections/${collectionId}/recipes/${recipeId}`, {
      method: 'POST',
    });
  },

  removeFromCollection(collectionId: string, recipeId: string): Promise<Collection> {
    return request<Collection>(`/api/collections/${collectionId}/recipes/${recipeId}`, {
      method: 'DELETE',
    });
  },

  deleteCollection(id: string): Promise<void> {
    return request<void>(`/api/collections/${id}`, { method: 'DELETE' });
  },
};
