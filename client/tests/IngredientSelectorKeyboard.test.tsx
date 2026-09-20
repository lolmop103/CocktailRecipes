import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IngredientSelector } from '../src/features/Recipes/components/IngredientSelector.js';
import type { IngredientMeta } from '../src/features/Recipes/types/index.js';

const known: IngredientMeta[] = [
  { name: 'gin', isAlcoholic: true },
  { name: 'rum', isAlcoholic: true },
  { name: 'lime juice', isAlcoholic: false },
];

function renderSelector(onChange = vi.fn()) {
  render(
    <IngredientSelector
      label="Ingredients"
      knownIngredients={known}
      selected={[]}
      onChange={onChange}
    />,
  );
  const input = screen.getByLabelText('Search ingredients');
  fireEvent.focus(input);
  return { input, onChange };
}

describe('IngredientSelector keyboard navigation', () => {
  it('highlights_firstOption_onArrowDown', () => {
    const { input } = renderSelector();

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps_toLastOption_onArrowUpFromStart', () => {
    const { input } = renderSelector();

    fireEvent.keyDown(input, { key: 'ArrowUp' });

    const options = screen.getAllByRole('option');
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('selects_highlightedOption_onEnter', () => {
    const { input, onChange } = renderSelector();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['gin']);
  });

  it('closes_dropdown_onEscape', () => {
    const { input } = renderSelector();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('exposes_activeDescendant_forScreenReaders', () => {
    const { input } = renderSelector();

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    const activeId = input.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('id', activeId);
  });

  it('doesNotSelect_onEnter_whenNothingHighlighted', () => {
    const { input, onChange } = renderSelector();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
  });
});
