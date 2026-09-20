import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipeFilters } from '../src/features/Recipes/components/RecipeFilters.js';
import { DEFAULT_FILTERS } from '../src/features/Recipes/hooks/useFilterParams.js';
import type { IngredientMeta } from '../src/features/Recipes/types/index.js';

const knownIngredients: IngredientMeta[] = [
  { name: 'gin', isAlcoholic: true },
  { name: 'rum', isAlcoholic: true },
  { name: 'lime', isAlcoholic: false },
  { name: 'soda', isAlcoholic: false },
];

const defaultFilterProps = {
  collections: [],
  onUpdateIngredientMeta: vi.fn(),
};

describe('RecipeFilters', () => {
  it('renders_searchInput', () => {
    render(
      <RecipeFilters
        filters={DEFAULT_FILTERS}
        knownIngredients={knownIngredients}
        onChange={vi.fn()}
        onReset={vi.fn()}
        {...defaultFilterProps}
      />,
    );
    expect(screen.getByLabelText('Search by name')).toBeInTheDocument();
  });

  it('calls_onChange_withSearch_whenTyping', () => {
    const onChange = vi.fn();
    render(
      <RecipeFilters
        filters={DEFAULT_FILTERS}
        knownIngredients={knownIngredients}
        onChange={onChange}
        onReset={vi.fn()}
        {...defaultFilterProps}
      />,
    );
    fireEvent.change(screen.getByLabelText('Search by name'), { target: { value: 'negroni' } });
    expect(onChange).toHaveBeenCalledWith('search', 'negroni');
  });

  it('calls_onReset_whenResetClicked', () => {
    const onReset = vi.fn();
    render(
      <RecipeFilters
        filters={DEFAULT_FILTERS}
        knownIngredients={knownIngredients}
        onChange={vi.fn()}
        onReset={onReset}
        {...defaultFilterProps}
      />,
    );
    fireEvent.click(screen.getByText('Reset'));
    expect(onReset).toHaveBeenCalled();
  });

  it('renders_minRatingStars', () => {
    render(
      <RecipeFilters
        filters={DEFAULT_FILTERS}
        knownIngredients={knownIngredients}
        onChange={vi.fn()}
        onReset={vi.fn()}
        {...defaultFilterProps}
      />,
    );
    expect(screen.getByLabelText('Minimum star rating')).toBeInTheDocument();
    expect(screen.getByLabelText('3 star minimum')).toBeInTheDocument();
  });

  it('calls_onChange_withMinRating_whenStarClicked', () => {
    const onChange = vi.fn();
    render(
      <RecipeFilters
        filters={DEFAULT_FILTERS}
        knownIngredients={knownIngredients}
        onChange={onChange}
        onReset={vi.fn()}
        {...defaultFilterProps}
      />,
    );
    fireEvent.click(screen.getByLabelText('4 star minimum'));
    expect(onChange).toHaveBeenCalledWith('minRating', 4);
  });

  it('renders_existingIngredientChips', () => {
    const filters = { ...DEFAULT_FILTERS, ingredients: ['rum', 'lime'] };
    render(
      <RecipeFilters
        filters={filters}
        knownIngredients={knownIngredients}
        onChange={vi.fn()}
        onReset={vi.fn()}
        {...defaultFilterProps}
      />,
    );
    expect(screen.getByText('rum')).toBeInTheDocument();
    expect(screen.getByText('lime')).toBeInTheDocument();
  });

  it('shows_onlyTheseCheckbox_whenIngredientsSelected', () => {
    const filters = { ...DEFAULT_FILTERS, ingredients: ['rum'] };
    render(
      <RecipeFilters
        filters={filters}
        knownIngredients={knownIngredients}
        onChange={vi.fn()}
        onReset={vi.fn()}
        {...defaultFilterProps}
      />,
    );
    expect(screen.getByText('Only these ingredients')).toBeInTheDocument();
  });

  it('hides_onlyTheseCheckbox_whenNoIngredientsSelected', () => {
    render(
      <RecipeFilters
        filters={DEFAULT_FILTERS}
        knownIngredients={knownIngredients}
        onChange={vi.fn()}
        onReset={vi.fn()}
        {...defaultFilterProps}
      />,
    );
    expect(screen.queryByText('Only these ingredients')).not.toBeInTheDocument();
  });
});
