import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StarRating } from '../src/features/Recipes/components/StarRating.js';

describe('StarRating', () => {
  it('StarRating_readOnly_noButtons', () => {
    render(<StarRating value={3} recipeName="Negroni" onRate={vi.fn()} readOnly />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('group', { name: 'Rating: 3' })).toBeInTheDocument();
  });

  it('StarRating_editable_fiveButtons', () => {
    render(<StarRating value={3} recipeName="Negroni" onRate={vi.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});
