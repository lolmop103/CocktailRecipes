import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { Collection, IngredientMeta, Recipe } from '../types/index.js';
import type { CreateRecipePayload, RecipeFilters, RecipeUpdatePayload } from '../types/index.js';
import { recipesApi } from '../services/api.js';

/**
 * Query keys in one place so invalidation cannot drift from the queries it is
 * meant to invalidate.
 */
export const queryKeys = {
  recipes: (filters: RecipeFilters) => ['recipes', filters] as const,
  allRecipes: ['recipes'] as const,
  ingredients: ['ingredients'] as const,
  collections: ['collections'] as const,
};

function invalidateRecipes(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: queryKeys.allRecipes });
}

export function useRecipesQuery(filters: RecipeFilters) {
  return useQuery({
    queryKey: queryKeys.recipes(filters),
    // React Query hands the signal in, so a superseded request is aborted and
    // its stale result can never replace a newer one.
    queryFn: ({ signal }) => recipesApi.list(filters, signal),
    // Keep showing the previous results while a new filter loads, instead of
    // flashing an empty grid on every keystroke.
    placeholderData: keepPreviousData,
  });
}

export function useIngredientsQuery() {
  return useQuery({
    queryKey: queryKeys.ingredients,
    queryFn: () => recipesApi.getIngredients(),
  });
}

export function useCollectionsQuery() {
  return useQuery({
    queryKey: queryKeys.collections,
    queryFn: () => recipesApi.getCollections(),
  });
}

export function useCreateRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRecipePayload) => recipesApi.create(payload),
    onSuccess: async () => {
      // Refetch rather than append: only the server knows whether the new
      // recipe matches the active tab, search and ingredient filters.
      await Promise.all([
        invalidateRecipes(client),
        client.invalidateQueries({ queryKey: queryKeys.ingredients }),
      ]);
    },
  });
}

export function useUpdateRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RecipeUpdatePayload }) =>
      recipesApi.update(id, payload),
    onSuccess: async () => {
      await Promise.all([
        invalidateRecipes(client),
        client.invalidateQueries({ queryKey: queryKeys.ingredients }),
      ]);
    },
  });
}

export function useRateRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number }) => recipesApi.rate(id, rating),
    onSuccess: (updated) => {
      // The rating is a small, local change — patch the cache in place rather
      // than refetching every list the recipe appears in.
      client.setQueriesData<Recipe[]>({ queryKey: queryKeys.allRecipes }, (current) =>
        current?.map((r) => (r.id === updated.id ? updated : r)),
      );
    },
  });
}

export function useDeleteRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => recipesApi.delete(id),
    onSuccess: async (_result, id) => {
      // The server drops the recipe from every collection, so both caches move.
      client.setQueriesData<Recipe[]>({ queryKey: queryKeys.allRecipes }, (current) =>
        current?.filter((r) => r.id !== id),
      );
      client.setQueryData<Collection[]>(queryKeys.collections, (current) =>
        current?.map((c) => ({ ...c, recipeIds: c.recipeIds.filter((rid) => rid !== id) })),
      );
      await invalidateRecipes(client);
    },
  });
}

export function useClassifyIngredient() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, isAlcoholic }: { name: string; isAlcoholic: boolean }) =>
      recipesApi.updateIngredientMeta(name, isAlcoholic),
    onSuccess: (updated) => {
      client.setQueryData<IngredientMeta[]>(queryKeys.ingredients, (current) =>
        current?.map((m) => (m.name.toLowerCase() === updated.name.toLowerCase() ? updated : m)),
      );
    },
  });
}

export function useCreateCollection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => recipesApi.createCollection(name),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.collections }),
  });
}

export function useAddToCollection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, recipeId }: { collectionId: string; recipeId: string }) =>
      recipesApi.addToCollection(collectionId, recipeId),
    onSuccess: (updated) => {
      client.setQueryData<Collection[]>(queryKeys.collections, (current) =>
        current?.map((c) => (c.id === updated.id ? updated : c)),
      );
    },
  });
}

export function useRemoveFromCollection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, recipeId }: { collectionId: string; recipeId: string }) =>
      recipesApi.removeFromCollection(collectionId, recipeId),
    onSuccess: (updated) => {
      client.setQueryData<Collection[]>(queryKeys.collections, (current) =>
        current?.map((c) => (c.id === updated.id ? updated : c)),
      );
    },
  });
}
