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

  it('LoadMore_loading_staysFocusableButIgnoresClicks', () => {
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore isLoading isError={false} onLoadMore={onLoadMore} />);
    const button = screen.getByRole('button', { name: 'Loading…' });

    fireEvent.click(button);

    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('LoadMore_error_announcesTheFailure', () => {
    render(<LoadMore hasMore isLoading={false} isError onLoadMore={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Could not load more recipes.');
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

describe('LoadMore — error text', () => {
  it('LoadMore_errorMessage_shown', () => {
    render(
      <LoadMore
        hasMore
        isLoading={false}
        isError
        errorMessage="Too many requests — try again in a moment"
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Too many requests — try again in a moment',
    );
  });
});
