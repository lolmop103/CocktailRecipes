import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadMore } from '../src/features/Recipes/components/LoadMore.js';

describe('LoadMore', () => {
  it('LoadMore_hasMore_showsShowMoreButton', () => {
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore isLoading={false} isError={false} onLoadMore={onLoadMore} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('LoadMore_loading_buttonDisabled', () => {
    render(<LoadMore hasMore isLoading isError={false} onLoadMore={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
  });

  it('LoadMore_error_showsTryAgain', () => {
    render(<LoadMore hasMore isLoading={false} isError onLoadMore={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('LoadMore_noMore_rendersNothing', () => {
    const { container } = render(
      <LoadMore hasMore={false} isLoading={false} isError={false} onLoadMore={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
