import type {
  Recipe,
  RecipeFilters,
  IngredientMeta,
  Collection,
  RecipeUpdatePayload,
  CreateRecipePayload,
} from '../types/index.js';

const BASE = '/api/recipes';

interface ApiErrorBody {
  status?: number;
  message?: string;
  errors?: { path: string; message: string }[];
}

/** An error carrying the server's structured field errors, when it sent any. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: { path: string; message: string }[];

  constructor(status: number, message: string, fieldErrors: { path: string; message: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body (proxy error, network appliance) — fall through.
    }
    throw new ApiError(res.status, body.message ?? res.statusText, body.errors ?? []);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

function jsonInit(method: string, body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  };
}

function buildQuery(filters: RecipeFilters): string {
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
  return params.toString();
}

export const recipesApi = {
  list(filters: RecipeFilters, signal?: AbortSignal): Promise<Recipe[]> {
    return request<Recipe[]>(`${BASE}?${buildQuery(filters)}`, signal ? { signal } : undefined);
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
