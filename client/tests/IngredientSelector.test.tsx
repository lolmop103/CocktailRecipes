import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IngredientSelector } from '../src/features/Recipes/components/IngredientSelector.js';
import type { IngredientMeta } from '../src/features/Recipes/types/index.js';

const known: IngredientMeta[] = [
  { name: 'gin', isAlcoholic: true },
  { name: 'rum', isAlcoholic: true },
  { name: 'lime juice', isAlcoholic: false },
  { name: 'soda water', isAlcoholic: false },
  { name: 'mint', isAlcoholic: false },
];

describe('IngredientSelector', () => {
  it('renders_searchInput', () => {
    render(
      <IngredientSelector
        label="Ingredients"
        knownIngredients={known}
        selected={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Search ingredients')).toBeInTheDocument();
  });

  it('shows_dropdown_onFocus', () => {
    render(
      <IngredientSelector
        label="Ingredients"
        knownIngredients={known}
        selected={[]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.focus(screen.getByLabelText('Search ingredients'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('filters_dropdown_bySearchText', () => {
    render(
      <IngredientSelector
        label="Ingredients"
        knownIngredients={known}
        selected={[]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Search ingredients'), { target: { value: 'li' } });
    expect(screen.getByText('lime juice')).toBeInTheDocument();
    expect(screen.queryByText('rum')).not.toBeInTheDocument();
  });

  it('calls_onChange_whenItemSelected', () => {
    const onChange = vi.fn();
    render(
      <IngredientSelector
        label="Ingredients"
        knownIngredients={known}
        selected={[]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Search ingredients'), { target: { value: 'rum' } });
    fireEvent.mouseDown(screen.getByText('rum'));
    expect(onChange).toHaveBeenCalledWith(['rum']);
  });

  it('renders_selectedChips', () => {
    render(
      <IngredientSelector
        label="Ingredients"
        knownIngredients={known}
        selected={['gin', 'rum']}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('gin')).toBeInTheDocument();
    expect(screen.getByText('rum')).toBeInTheDocument();
  });

  it('calls_onChange_whenChipRemoved', () => {
    const onChange = vi.fn();
    render(
      <IngredientSelector
        label="Ingredients"
        knownIngredients={known}
        selected={['gin', 'rum']}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Remove gin'));
    expect(onChange).toHaveBeenCalledWith(['rum']);
  });

  it('excludes_alreadySelected_fromDropdown', () => {
    render(
      <IngredientSelector
        label="Ingredients"
        knownIngredients={known}
        selected={['gin']}
        onChange={vi.fn()}
      />,
    );
    fireEvent.focus(screen.getByLabelText('Search ingredients'));
    expect(screen.queryByRole('option', { name: /gin/i })).not.toBeInTheDocument();
  });
});
