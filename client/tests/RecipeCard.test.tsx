import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipeCard } from '../src/features/Recipes/components/RecipeCard.js';
import type { Recipe } from '../src/features/Recipes/types/index.js';

const fullRecipe: Recipe = {
  id: '1',
  name: 'Negroni',
  ingredients: [
    { name: 'gin', amount: '30ml' },
    { name: 'sweet vermouth', amount: '30ml' },
    { name: 'Campari', amount: '30ml' },
  ],
  instructions: 'Stir over ice.',
  glassType: 'rocks',
  tags: ['bitter', 'classic'],
  rating: 5,
  isMocktail: false,
};

const minimalRecipe: Recipe = {
  id: '2',
  name: 'Simple Mix',
  ingredients: [{ name: 'vodka' }],
  isMocktail: false,
};

const defaultCardProps = {
  collections: [],
  onAddToCollection: vi.fn(),
  onRemoveFromCollection: vi.fn(),
  onCreateCollection: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe('RecipeCard', () => {
  it('renders_recipeName', () => {
    render(<RecipeCard recipe={fullRecipe} unit="ml" onRate={vi.fn()} {...defaultCardProps} />);
    expect(screen.getByText('Negroni')).toBeInTheDocument();
  });

  it('renders_allIngredients', () => {
    render(<RecipeCard recipe={fullRecipe} unit="ml" onRate={vi.fn()} {...defaultCardProps} />);
    expect(screen.getByText('gin')).toBeInTheDocument();
    expect(screen.getByText('sweet vermouth')).toBeInTheDocument();
    expect(screen.getByText('Campari')).toBeInTheDocument();
  });

  it('renders_ingredientAmounts_inMl', () => {
    render(<RecipeCard recipe={fullRecipe} unit="ml" onRate={vi.fn()} {...defaultCardProps} />);
    expect(screen.getAllByText('30ml').length).toBeGreaterThan(0);
  });

  it('renders_ingredientAmounts_convertedToOz', () => {
    render(<RecipeCard recipe={fullRecipe} unit="oz" onRate={vi.fn()} {...defaultCardProps} />);
    // 30ml × 0.0338 = 1.014 → rounds to 1 oz
    expect(screen.getAllByText('1 oz').length).toBeGreaterThan(0);
  });

  it('renders_glassType_andTags', () => {
    render(<RecipeCard recipe={fullRecipe} unit="ml" onRate={vi.fn()} {...defaultCardProps} />);
    expect(screen.getByText('rocks')).toBeInTheDocument();
    expect(screen.getByText('bitter')).toBeInTheDocument();
  });

  it('renders_instructions_whenPresent', () => {
    render(<RecipeCard recipe={fullRecipe} unit="ml" onRate={vi.fn()} {...defaultCardProps} />);
    expect(screen.getByText('Stir over ice.')).toBeInTheDocument();
  });

  it('doesNotRender_instructions_whenAbsent', () => {
    render(<RecipeCard recipe={minimalRecipe} unit="ml" onRate={vi.fn()} {...defaultCardProps} />);
    expect(screen.queryByText('Stir over ice.')).not.toBeInTheDocument();
  });

  it('renders_ingredientCount', () => {
    render(<RecipeCard recipe={fullRecipe} unit="ml" onRate={vi.fn()} {...defaultCardProps} />);
    expect(screen.getByText('3 ingredients')).toBeInTheDocument();
  });

  it('calls_onRate_whenStarClicked', () => {
    const onRate = vi.fn();
    render(<RecipeCard recipe={fullRecipe} unit="ml" onRate={onRate} {...defaultCardProps} />);
    fireEvent.click(screen.getByLabelText('Rate Negroni 3 stars'));
    expect(onRate).toHaveBeenCalledWith('1', 3);
  });

  it('renders_filledStars_forRating', () => {
    render(<RecipeCard recipe={fullRecipe} unit="ml" onRate={vi.fn()} {...defaultCardProps} />);
    const filledStars = document.querySelectorAll('.star--filled');
    expect(filledStars).toHaveLength(5);
  });

  it('calls_onEdit_whenEditButtonClicked', () => {
    const onEdit = vi.fn();
    render(
      <RecipeCard
        recipe={fullRecipe}
        unit="ml"
        onRate={vi.fn()}
        {...defaultCardProps}
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit Negroni'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls_onDelete_afterConfirmation', () => {
    const onDelete = vi.fn();
    vi.stubGlobal('confirm', () => true);
    render(
      <RecipeCard
        recipe={fullRecipe}
        unit="ml"
        onRate={vi.fn()}
        {...defaultCardProps}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText('Delete Negroni'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('doesNotCall_onDelete_whenConfirmCancelled', () => {
    const onDelete = vi.fn();
    vi.stubGlobal('confirm', () => false);
    render(
      <RecipeCard
        recipe={fullRecipe}
        unit="ml"
        onRate={vi.fn()}
        {...defaultCardProps}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText('Delete Negroni'));
    expect(onDelete).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
