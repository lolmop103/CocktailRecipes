import { useState, useId, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RecipeFilters as RecipeFiltersPanel } from './components/RecipeFilters.js';
import { RecipeSortBar } from './components/RecipeSortBar.js';
import { RecipeCard } from './components/RecipeCard.js';
import { AddRecipeModal } from './components/AddRecipeModal.js';
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
  useRecipesQuery,
  useRemoveFromCollection,
  useUpdateRecipe,
} from './hooks/useRecipeQueries.js';
import type { IngredientMeta, Recipe } from './types/index.js';

/** Long enough to swallow a burst of typing, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

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

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  const ingredientsQuery = useIngredientsQuery();
  const collectionsQuery = useCollectionsQuery();
  const knownIngredients = useMemo<IngredientMeta[]>(
    () => ingredientsQuery.data ?? [],
    [ingredientsQuery.data],
  );
  const collections = collectionsQuery.data ?? [];

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

  const recipesQuery = useRecipesQuery(queryFilters);
  const recipes = recipesQuery.data ?? [];

  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const rateRecipe = useRateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const classifyIngredient = useClassifyIngredient();
  const createCollection = useCreateCollection();
  const addToCollection = useAddToCollection();
  const removeFromCollection = useRemoveFromCollection();

  const message = recipesQuery.isError
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
              totalCount={recipes.length}
              unit={unit}
              onToggleUnit={toggleUnit}
              onChange={updateFilter}
            />
            <button type="button" className="btn-add-recipe" onClick={() => setShowAddModal(true)}>
              + New Recipe
            </button>
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
                unit={unit}
                collections={collections}
                onRate={(id, rating) => rateRecipe.mutate({ id, rating })}
                onEdit={() => setEditingRecipe(recipe)}
                onDelete={() => deleteRecipe.mutate(recipe.id)}
                onAddToCollection={(collectionId, recipeId) =>
                  addToCollection.mutate({ collectionId, recipeId })
                }
                onRemoveFromCollection={(collectionId, recipeId) =>
                  removeFromCollection.mutate({ collectionId, recipeId })
                }
                onCreateCollection={(name) => createCollection.mutate(name)}
              />
            ))}
          </div>
        </main>
      </div>

      {showAddModal && (
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
