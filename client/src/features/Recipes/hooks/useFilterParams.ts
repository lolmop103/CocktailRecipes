import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RecipeFilters, SortBy, SortOrder } from '../types/index.js';

export const DEFAULT_FILTERS: RecipeFilters = {
  search: '',
  ingredients: [],
  excludeIngredients: [],
  onlySelectedIngredients: false,
  minRating: undefined,
  sortBy: 'name',
  sortOrder: 'asc',
};

const SORT_BY_VALUES: SortBy[] = ['name', 'rating', 'ingredientCount'];

function parseSortBy(value: string | null): SortBy {
  return SORT_BY_VALUES.includes(value as SortBy) ? (value as SortBy) : 'name';
}

function parseSortOrder(value: string | null): SortOrder {
  return value === 'desc' ? 'desc' : 'asc';
}

function parseRating(value: string | null): number | undefined {
  const parsed = Number(value);
  return value !== null && Number.isInteger(parsed) && parsed >= 1 && parsed <= 5
    ? parsed
    : undefined;
}

/**
 * Filter state lives in the URL rather than component state, so a filtered view
 * can be bookmarked, shared and reached with the back button.
 *
 * `isMocktail` is deliberately excluded: it comes from the route path
 * (`/cocktails` vs `/mocktails`) rather than a query parameter.
 */
export function useFilterParams(isMocktail: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<RecipeFilters>(() => {
    const ingredients = searchParams.get('ingredients');
    const excluded = searchParams.get('exclude');
    const collectionId = searchParams.get('collection');

    return {
      search: searchParams.get('q') ?? '',
      ingredients: ingredients ? ingredients.split(',').filter(Boolean) : [],
      excludeIngredients: excluded ? excluded.split(',').filter(Boolean) : [],
      onlySelectedIngredients: searchParams.get('only') === 'true',
      minRating: parseRating(searchParams.get('rating')),
      sortBy: parseSortBy(searchParams.get('sortBy')),
      sortOrder: parseSortOrder(searchParams.get('sortOrder')),
      isMocktail,
      ...(collectionId ? { collectionId } : {}),
    };
  }, [searchParams, isMocktail]);

  const updateFilter = useCallback(
    <K extends keyof RecipeFilters>(key: K, value: RecipeFilters[K]) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);

          const write = (param: string, raw: string | undefined) => {
            if (raw === undefined || raw === '') next.delete(param);
            else next.set(param, raw);
          };

          switch (key) {
            case 'search':
              write('q', value as string);
              break;
            case 'ingredients':
              write('ingredients', (value as string[]).join(','));
              break;
            case 'excludeIngredients':
              write('exclude', (value as string[]).join(','));
              break;
            case 'onlySelectedIngredients':
              write('only', value === true ? 'true' : undefined);
              break;
            case 'minRating':
              write('rating', value === undefined ? undefined : String(value));
              break;
            case 'sortBy':
              // The default is implied by its absence, keeping URLs short.
              write('sortBy', value === 'name' ? undefined : (value as string));
              break;
            case 'sortOrder':
              write('sortOrder', value === 'asc' ? undefined : (value as string));
              break;
            case 'collectionId':
              write('collection', value as string | undefined);
              break;
            default:
              break;
          }

          return next;
        },
        // Typing in the search box must not push a history entry per keystroke.
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const resetFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  return { filters, updateFilter, resetFilters };
}
