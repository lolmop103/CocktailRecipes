import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useFilterParams } from '../src/features/Recipes/hooks/useFilterParams.js';

function renderAt(route: string, isMocktail = false) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => {
      const params = useFilterParams(isMocktail);
      const location = useLocation();
      return { ...params, search: location.search };
    },
    { wrapper },
  );
}

describe('useFilterParams — reading', () => {
  it('returnsDefaults_forAnEmptyQueryString', () => {
    const { result } = renderAt('/cocktails');

    expect(result.current.filters).toEqual({
      search: '',
      ingredients: [],
      excludeIngredients: [],
      onlySelectedIngredients: false,
      minRating: undefined,
      sortBy: 'name',
      sortOrder: 'asc',
      isMocktail: false,
    });
  });

  it('parsesEveryParameter_fromTheUrl', () => {
    const { result } = renderAt(
      '/mocktails?q=mo&ingredients=gin,lime&exclude=rum&only=true&rating=4&sortBy=rating&sortOrder=desc&collection=7',
      true,
    );

    expect(result.current.filters).toEqual({
      search: 'mo',
      ingredients: ['gin', 'lime'],
      excludeIngredients: ['rum'],
      onlySelectedIngredients: true,
      minRating: 4,
      sortBy: 'rating',
      sortOrder: 'desc',
      isMocktail: true,
      collectionId: '7',
    });
  });

  it('fallsBackToDefaults_forGarbageValues', () => {
    const { result } = renderAt('/cocktails?rating=9&sortBy=colour&sortOrder=sideways&only=yes');

    expect(result.current.filters.minRating).toBeUndefined();
    expect(result.current.filters.sortBy).toBe('name');
    expect(result.current.filters.sortOrder).toBe('asc');
    expect(result.current.filters.onlySelectedIngredients).toBe(false);
  });
});

describe('useFilterParams — writing', () => {
  it('writesEachFilter_underItsOwnQueryParameter', () => {
    const { result } = renderAt('/cocktails');

    act(() => result.current.updateFilter('search', 'negroni'));
    act(() => result.current.updateFilter('ingredients', ['gin', 'Campari']));
    act(() => result.current.updateFilter('excludeIngredients', ['vodka']));
    act(() => result.current.updateFilter('onlySelectedIngredients', true));
    act(() => result.current.updateFilter('minRating', 3));
    act(() => result.current.updateFilter('sortBy', 'ingredientCount'));
    act(() => result.current.updateFilter('sortOrder', 'desc'));
    act(() => result.current.updateFilter('collectionId', '2'));

    const params = new URLSearchParams(result.current.search);
    expect(params.get('q')).toBe('negroni');
    expect(params.get('ingredients')).toBe('gin,Campari');
    expect(params.get('exclude')).toBe('vodka');
    expect(params.get('only')).toBe('true');
    expect(params.get('rating')).toBe('3');
    expect(params.get('sortBy')).toBe('ingredientCount');
    expect(params.get('sortOrder')).toBe('desc');
    expect(params.get('collection')).toBe('2');
  });

  it('omitsDefaultValues_toKeepUrlsShort', () => {
    const { result } = renderAt(
      '/cocktails?q=x&ingredients=gin&only=true&rating=3&sortBy=rating&sortOrder=desc&collection=2',
    );

    act(() => result.current.updateFilter('search', ''));
    act(() => result.current.updateFilter('ingredients', []));
    act(() => result.current.updateFilter('onlySelectedIngredients', false));
    act(() => result.current.updateFilter('minRating', undefined));
    act(() => result.current.updateFilter('sortBy', 'name'));
    act(() => result.current.updateFilter('sortOrder', 'asc'));
    act(() => result.current.updateFilter('collectionId', undefined));

    expect(result.current.search).toBe('');
  });

  it('ignoresUnknownKeys', () => {
    const { result } = renderAt('/cocktails?q=keep');

    act(() => result.current.updateFilter('isMocktail', true));

    expect(result.current.search).toBe('?q=keep');
  });

  it('resetFilters_clearsTheQueryString', () => {
    const { result } = renderAt('/cocktails?q=x&ingredients=gin&rating=5');

    act(() => result.current.resetFilters());

    expect(result.current.search).toBe('');
    expect(result.current.filters.search).toBe('');
  });
});
