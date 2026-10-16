import { useRef } from 'react';
import { useLoadMoreOnVisible } from '../hooks/useLoadMoreOnVisible.js';

interface Props {
  hasMore: boolean;
  isLoading: boolean;
  isError: boolean;
  onLoadMore: () => void;
}

/**
 * The end of the recipe grid. The next page loads on its own as the sentinel
 * nears the viewport; the button is the same trigger for keyboard and
 * screen-reader users, and the way to retry after a failed load.
 */
export const LoadMore = ({ hasMore, isLoading, isError, onLoadMore }: Props) => {
  const sentinel = useRef<HTMLDivElement>(null);
  useLoadMoreOnVisible(sentinel, hasMore && !isLoading && !isError, onLoadMore);

  if (!hasMore) return null;

  const label = isLoading ? 'Loading…' : isError ? 'Try again' : 'Show more';

  return (
    <div className="load-more">
      <div ref={sentinel} className="load-more__sentinel" aria-hidden="true" />
      {isError && (
        <p role="status" className="load-more__status">
          Could not load more recipes.
        </p>
      )}
      {/* aria-disabled rather than disabled: a disabled button would drop
          keyboard focus to the top of the page while the next page loads. */}
      <button
        type="button"
        className="btn-load-more"
        aria-disabled={isLoading}
        onClick={isLoading ? undefined : onLoadMore}
      >
        {label}
      </button>
    </div>
  );
};
