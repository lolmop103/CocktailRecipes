import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ClassifyIngredientsModal } from '../src/features/Recipes/components/ClassifyIngredientsModal.js';
import { ManageIngredientsPanel } from '../src/features/Recipes/components/ManageIngredientsPanel.js';
import type { IngredientMeta } from '../src/features/Recipes/types/index.js';

function renderModal(names = ['Campari', 'soda water']) {
  const onConfirm = vi.fn();
  const onSkip = vi.fn();
  render(<ClassifyIngredientsModal names={names} onConfirm={onConfirm} onSkip={onSkip} />);
  return { onConfirm, onSkip };
}

function classify(name: string, choice: 'Alcoholic' | 'Non-alcoholic') {
  const group = screen.getByRole('group', { name: `${name} type` });
  fireEvent.click(within(group).getByRole('button', { name: choice }));
}

describe('ClassifyIngredientsModal', () => {
  it('lists_everyUnknownIngredient', () => {
    renderModal();

    expect(screen.getByText('Campari')).toBeInTheDocument();
    expect(screen.getByText('soda water')).toBeInTheDocument();
  });

  it('presetsNothing_soNoIngredientIsGuessed', () => {
    renderModal(['Campari']);

    const group = screen.getByRole('group', { name: 'Campari type' });
    // Defaulting to "alcoholic" would silently corrupt mocktail filtering.
    expect(within(group).getByRole('button', { name: 'Alcoholic' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(group).getByRole('button', { name: 'Non-alcoholic' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('blocksConfirm_untilEverythingIsClassified', () => {
    renderModal();

    const confirm = screen.getByRole('button', { name: /left to classify/ });
    expect(confirm).toBeDisabled();

    classify('Campari', 'Alcoholic');
    expect(screen.getByRole('button', { name: /1 left to classify/ })).toBeDisabled();

    classify('soda water', 'Non-alcoholic');
    expect(screen.getByRole('button', { name: 'Save classifications' })).toBeEnabled();
  });

  it('reportsEachChoice_onConfirm', () => {
    const { onConfirm } = renderModal();

    classify('Campari', 'Alcoholic');
    classify('soda water', 'Non-alcoholic');
    fireEvent.click(screen.getByRole('button', { name: 'Save classifications' }));

    expect(onConfirm).toHaveBeenCalledWith([
      { name: 'Campari', isAlcoholic: true },
      { name: 'soda water', isAlcoholic: false },
    ]);
  });

  it('allowsChangingAChoice_beforeConfirming', () => {
    const { onConfirm } = renderModal(['Campari']);

    classify('Campari', 'Alcoholic');
    classify('Campari', 'Non-alcoholic');
    fireEvent.click(screen.getByRole('button', { name: 'Save classifications' }));

    expect(onConfirm).toHaveBeenCalledWith([{ name: 'Campari', isAlcoholic: false }]);
  });

  it('skips_withoutClassifying', () => {
    const { onSkip, onConfirm } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('treatsEscape_asSkip', () => {
    const { onSkip } = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('ManageIngredientsPanel', () => {
  const known: IngredientMeta[] = [
    { name: 'gin', isAlcoholic: true },
    { name: 'soda water', isAlcoholic: false },
    { name: 'mystery bitters', isAlcoholic: null },
  ];

  function renderPanel() {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <ManageIngredientsPanel knownIngredients={known} onUpdate={onUpdate} onClose={onClose} />,
    );
    return { onUpdate, onClose };
  }

  it('reflects_currentClassification', () => {
    renderPanel();

    const ginGroup = screen.getByRole('group', { name: 'gin classification' });
    expect(within(ginGroup).getByRole('button', { name: 'Alcoholic' })).toHaveClass(
      'classify-btn--active',
    );
  });

  it('flags_unclassifiedIngredients', () => {
    renderPanel();

    expect(screen.getByLabelText('Not yet classified')).toBeInTheDocument();
  });

  it('savesChange_whenClassificationDiffers', () => {
    const { onUpdate } = renderPanel();

    const group = screen.getByRole('group', { name: 'soda water classification' });
    fireEvent.click(within(group).getByRole('button', { name: 'Alcoholic' }));

    expect(onUpdate).toHaveBeenCalledWith('soda water', true);
  });

  it('skipsRequest_whenClassificationIsUnchanged', () => {
    const { onUpdate } = renderPanel();

    const group = screen.getByRole('group', { name: 'gin classification' });
    fireEvent.click(within(group).getByRole('button', { name: 'Alcoholic' }));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('classifies_aPreviouslyUnknownIngredient', () => {
    const { onUpdate } = renderPanel();

    const group = screen.getByRole('group', { name: 'mystery bitters classification' });
    fireEvent.click(within(group).getByRole('button', { name: 'Non-alcoholic' }));

    expect(onUpdate).toHaveBeenCalledWith('mystery bitters', false);
  });

  it('closes_onRequest', () => {
    const { onClose } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
