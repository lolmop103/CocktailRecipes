import { useCallback, useState, useId, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RecipeFilters as RecipeFiltersPanel } from './components/RecipeFilters.js';
import { RecipeSortBar } from './components/RecipeSortBar.js';
import { RecipeCard } from './components/RecipeCard.js';
import { AddRecipeModal } from './components/AddRecipeModal.js';
import { LoadMore } from './components/LoadMore.js';
import { RecipeTabs, type RecipeTab } from './components/RecipeTabs.js';
import { useUnit } from './hooks/useUnit.js';
import { useFilterParams } from './hooks/useFilterParams.js';
import { useDebouncedValue } from './hooks/useDebouncedValue.js';
import {
  useAddToCollection,
  useClassifyIngredient,
  useCollectionsQuery,
  useCreateCollection,
  useCreateRecipe,
  useDeleteRecipe,
  useIngredientsQuery,
  useRateRecipe,
  useRecipePages,
  useRemoveFromCollection,
  useUpdateRecipe,
} from './hooks/useRecipeQueries.js';
import type { Collection, IngredientMeta, Recipe } from './types/index.js';
import { flattenPages } from './utils/pages.js';
import { useSession } from '@/features/Auth/hooks/useSession.js';

/** Long enough to swallow a burst of typing, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

/** One empty list for every render, so memoised cards see the same prop. */
const NO_COLLECTIONS: Collection[] = [];

interface Props {
  tab: RecipeTab;
}

export const RecipesPage = ({ tab }: Props) => {
  const isMocktail = tab === 'mocktail';
  const navigate = useNavigate();
  const location = useLocation();
  const panelId = useId();

  const { filters, updateFilter, resetFilters } = useFilterParams(isMocktail);
  const { unit, toggle: toggleUnit } = useUnit();
  const { isAdmin } = useSession();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  const ingredientsQuery = useIngredientsQuery();
  const collectionsQuery = useCollectionsQuery();
  const knownIngredients = useMemo<IngredientMeta[]>(
    () => ingredientsQuery.data ?? [],
    [ingredientsQuery.data],
  );
  const collections = collectionsQuery.data ?? NO_COLLECTIONS;

  // Only the search term is debounced; every other filter applies at once.
  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);

  const queryFilters = useMemo(() => {
    // On the mocktail tab, drop alcoholic ingredients from the request but keep
    // them in the URL so switching back restores the selection.
    const ingredients = isMocktail
      ? filters.ingredients.filter(
          (name) =>
            knownIngredients.find((m) => m.name.toLowerCase() === name.toLowerCase())
              ?.isAlcoholic !== true,
        )
      : filters.ingredients;

    return { ...filters, search: debouncedSearch, ingredients };
  }, [filters, debouncedSearch, isMocktail, knownIngredients]);

  const recipesQuery = useRecipePages(queryFilters);
  const { recipes, total } = useMemo(
    () => flattenPages(recipesQuery.data?.pages ?? []),
    [recipesQuery.data],
  );
  const { fetchNextPage } = recipesQuery;
  const loadMore = useCallback(() => {
    // Never cancel an in-flight refetch: its fresh offsets are what the next page
    // must start from after a delete or create.
    void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage]);

  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const rateRecipe = useRateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const classifyIngredient = useClassifyIngredient();
  const createCollection = useCreateCollection();
  const addToCollection = useAddToCollection();
  const removeFromCollection = useRemoveFromCollection();

  // Stable handlers: `mutate` and state setters keep their identity across
  // renders, so the memoised cards are not re-rendered when a page is appended.
  const { mutate: rate } = rateRecipe;
  const { mutate: remove } = deleteRecipe;
  const { mutate: addTo } = addToCollection;
  const { mutate: removeFrom } = removeFromCollection;
  const { mutate: createNamedCollection } = createCollection;
  const handleRate = useCallback((id: string, rating: number) => rate({ id, rating }), [rate]);
  const handleDelete = useCallback((id: string) => remove(id), [remove]);
  const handleAddToCollection = useCallback(
    (collectionId: string, recipeId: string) => addTo({ collectionId, recipeId }),
    [addTo],
  );
  const handleRemoveFromCollection = useCallback(
    (collectionId: string, recipeId: string) => removeFrom({ collectionId, recipeId }),
    [removeFrom],
  );
  const handleCreateCollection = useCallback(
    (name: string) => createNamedCollection(name),
    [createNamedCollection],
  );

  // A failed next page is reported on the Show more button, not as a page error.
  const message =
    recipesQuery.isError && !recipesQuery.isFetchNextPageError
      ? 'Could not load recipes. Is the server running?'
      : ingredientsQuery.isError
        ? 'Could not load the ingredient list.'
        : collectionsQuery.isError
          ? 'Could not load collections.'
          : deleteRecipe.isError
            ? 'Could not delete that recipe.'
            : rateRecipe.isError
              ? 'Failed to save rating.'
              : null;

  const handleClassifyIngredients = async (results: { name: string; isAlcoholic: boolean }[]) => {
    await Promise.all(results.map((r) => classifyIngredient.mutateAsync(r)));
  };

  return (
    <div className="recipes-root">
      <RecipeTabs
        activeTab={tab}
        panelId={panelId}
        // The tab is the route, so switching it is navigation — and the current
        // filters travel with it.
        onChange={(next) =>
          navigate({ pathname: `/${next}s`, search: location.search }, { replace: false })
        }
      />

      <div className="recipes-layout">
        <RecipeFiltersPanel
          canEdit={isAdmin}
          filters={filters}
          knownIngredients={knownIngredients}
          collections={collections}
          hideAlcoholicIngredients={isMocktail}
          onChange={updateFilter}
          onReset={resetFilters}
          onUpdateIngredientMeta={async (name, isAlcoholic) => {
            await classifyIngredient.mutateAsync({ name, isAlcoholic });
          }}
        />

        <main className="recipes-main" id={panelId} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          <div className="recipes-main__toolbar">
            <RecipeSortBar
              filters={filters}
              shownCount={recipes.length}
              totalCount={total}
              unit={unit}
              onToggleUnit={toggleUnit}
              onChange={updateFilter}
            />
            {isAdmin && (
              <button
                type="button"
                className="btn-add-recipe"
                onClick={() => setShowAddModal(true)}
              >
                + New Recipe
              </button>
            )}
          </div>

          <div aria-live="polite" aria-atomic="true">
            {recipesQuery.isPending && <p className="status-msg">Loading…</p>}
            {message && <p className="status-msg status-msg--error">{message}</p>}
            {!recipesQuery.isPending && !message && recipes.length === 0 && (
              <p className="status-msg">No recipes match your filters.</p>
            )}
          </div>

          <div className="recipe-grid">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                canEdit={isAdmin}
                unit={unit}
                collections={collections}
                onRate={handleRate}
                onEdit={setEditingRecipe}
                onDelete={handleDelete}
                onAddToCollection={handleAddToCollection}
                onRemoveFromCollection={handleRemoveFromCollection}
                onCreateCollection={handleCreateCollection}
              />
            ))}
          </div>

          <LoadMore
            hasMore={recipesQuery.hasNextPage}
            // Any fetch, refetches included, pauses auto-loading: a next page
            // requested from stale offsets could skip a recipe.
            isLoading={recipesQuery.isFetching}
            isError={recipesQuery.isFetchNextPageError}
            onLoadMore={loadMore}
          />
        </main>
      </div>

      {isAdmin && showAddModal && (
        <AddRecipeModal
          knownIngredients={knownIngredients}
          defaultIsMocktail={isMocktail}
          onClose={() => setShowAddModal(false)}
          onCreated={async (payload) => {
            await createRecipe.mutateAsync(payload);
          }}
          onClassifyIngredients={handleClassifyIngredients}
        />
      )}

      {editingRecipe && (
        <AddRecipeModal
          initialRecipe={editingRecipe}
          knownIngredients={knownIngredients}
          onClose={() => setEditingRecipe(null)}
          onCreated={async (payload) => {
            await createRecipe.mutateAsync(payload);
          }}
          onUpdated={async (id, payload) => {
            await updateRecipe.mutateAsync({ id, payload });
          }}
          onClassifyIngredients={handleClassifyIngredients}
        />
      )}
    </div>
  );
};
