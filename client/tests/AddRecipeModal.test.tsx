import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddRecipeModal } from '../src/features/Recipes/components/AddRecipeModal.js';
import type { IngredientMeta } from '../src/features/Recipes/types/index.js';

const knownIngredients: IngredientMeta[] = [
  { name: 'Gin', isAlcoholic: true },
  { name: 'Prosecco', isAlcoholic: true },
  { name: 'Campari', isAlcoholic: true },
  { name: 'Sweet Vermouth', isAlcoholic: true },
];

const defaultModalProps = {
  knownIngredients,
  onClose: vi.fn(),
  onCreated: vi.fn(),
  onClassifyIngredients: vi.fn(),
};

describe('AddRecipeModal', () => {
  it('renders_nameInput', () => {
    render(<AddRecipeModal {...defaultModalProps} />);
    expect(screen.getByLabelText('Name *')).toBeInTheDocument();
  });

  it('renders_firstIngredientRow', () => {
    render(<AddRecipeModal {...defaultModalProps} />);
    expect(screen.getByLabelText('Ingredient 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Ingredient 1 amount')).toBeInTheDocument();
  });

  it('shows_known_ingredients_in_dropdown_onFocus', () => {
    render(<AddRecipeModal {...defaultModalProps} />);
    // type a partial match — "gi" matches "Gin" but is not equal to it
    fireEvent.change(screen.getByLabelText('Ingredient 1 name'), { target: { value: 'gi' } });
    expect(screen.getByText('Gin')).toBeInTheDocument();
  });

  it('adds_ingredientRow_onButtonClick', () => {
    render(<AddRecipeModal {...defaultModalProps} />);
    fireEvent.click(screen.getByText('+ Add ingredient'));
    expect(screen.getByLabelText('Ingredient 2 name')).toBeInTheDocument();
  });

  it('calls_onClose_whenCancelClicked', () => {
    const onClose = vi.fn();
    render(<AddRecipeModal {...defaultModalProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows_error_whenSubmittedEmpty', async () => {
    render(<AddRecipeModal {...defaultModalProps} />);
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => {
      expect(
        screen.getByText('Name and at least one ingredient are required.'),
      ).toBeInTheDocument();
    });
  });

  it('calls_onCreated_withCorrectPayload_includingUnit', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    render(<AddRecipeModal {...defaultModalProps} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Spritz' } });
    fireEvent.change(screen.getByLabelText('Ingredient 1 name'), { target: { value: 'Prosecco' } });
    // amount is a number; unit defaults to ml -> assembled as "90ml"
    fireEvent.change(screen.getByLabelText('Ingredient 1 amount'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Glass type'), { target: { value: 'wine' } });

    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Spritz',
          ingredients: [{ name: 'Prosecco', amount: '90ml' }],
          glassType: 'wine',
        }),
      );
    });
  });

  it('omits_emptyIngredientRows', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    render(<AddRecipeModal {...defaultModalProps} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('Ingredient 1 name'), { target: { value: 'Gin' } });
    fireEvent.click(screen.getByText('+ Add ingredient'));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Test' } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
      const [payload] = onCreated.mock.calls[0] as [{ ingredients: unknown[] }];
      expect(payload.ingredients).toHaveLength(1);
    });
  });
});
