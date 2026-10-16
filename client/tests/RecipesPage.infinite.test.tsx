import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils.js';
import { installIntersectionObserverStub, type ObserverStub } from './intersectionObserverStub.js';
import type { Recipe, RecipePage } from '../src/features/Recipes/types/index.js';
import type * as StarRatingModule from '../src/features/Recipes/components/StarRating.js';

const api = {
  list: vi.fn(),
  getIngredients: vi.fn(),
  getCollections: vi.fn(),
  rate: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../src/features/Recipes/services/api.js', () => ({
  recipesApi: api,
  ApiError: class ApiError extends Error {
    fieldErrors: { path: string; message: string }[] = [];
  },
}));

/** Renders per card, keyed by recipe name — counts re-renders of existing cards. */
const starRenders = new Map<string, number>();
vi.mock('../src/features/Recipes/components/StarRating.js', async (importOriginal) => {
  const original = await importOriginal<typeof StarRatingModule>();
  return {
    StarRating: (props: Parameters<typeof original.StarRating>[0]) => {
      starRenders.set(props.recipeName, (starRenders.get(props.recipeName) ?? 0) + 1);
      return original.StarRating(props);
    },
  };
});

const { RecipesPage } = await import('../src/features/Recipes/RecipesPage.js');

const recipe = (i: number, prefix = 'R'): Recipe => ({
  id: `${prefix}${String(i)}`,
  name: `${prefix}${String(i)}`,
  ingredients: [{ name: 'gin' }],
  isMocktail: false,
});
const range = (from: number, to: number, prefix?: string) =>
  Array.from({ length: to - from }, (_, k) => recipe(from + k, prefix));
const page = (items: Recipe[], total: number, nextOffset: number | null): RecipePage => ({
  items,
  total,
  nextOffset,
});

let observers: ObserverStub;

beforeEach(() => {
  vi.clearAllMocks();
  starRenders.clear();
  observers = installIntersectionObserverStub();
  api.getIngredients.mockResolvedValue([]);
  api.getCollections.mockResolvedValue([]);
});

/** First page R0–R23 of 30; the second page R24–R29. */
function twoPages() {
  api.list.mockImplementation((_filters: unknown, offset: number) =>
    Promise.resolve(offset === 0 ? page(range(0, 24), 30, 24) : page(range(24, 30), 30, null)),
  );
}

async function renderPage() {
  renderWithProviders(<RecipesPage tab="cocktail" />, { route: '/cocktails' });
  await screen.findByRole('heading', { name: 'R0' });
}

describe('RecipesPage — infinite list', () => {
  it('RecipesPage_resultCount_showingXofY', async () => {
    twoPages();

    await renderPage();

    expect(screen.getByText('Showing 24 of 30 recipes')).toBeInTheDocument();
  });

  it('RecipesPage_scrollToEnd_requestsOffset24', async () => {
    twoPages();
    await renderPage();

    observers.fire(true);

    await screen.findByRole('heading', { name: 'R29' });
    expect(api.list).toHaveBeenLastCalledWith(expect.anything(), 24, expect.anything());
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 30 of 30 recipes')).toBeInTheDocument();
  });

  it('RecipesPage_showMoreButton_loadsNextPage', async () => {
    twoPages();
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(await screen.findByRole('heading', { name: 'R29' })).toBeInTheDocument();
  });

  it('RecipesPage_nextPageFails_showsTryAgain', async () => {
    api.list.mockImplementation((_filters: unknown, offset: number) =>
      offset === 0
        ? Promise.resolve(page(range(0, 24), 30, 24))
        : Promise.reject(new Error('down')),
    );
    await renderPage();

    observers.fire(true);

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('RecipesPage_filterChangeWhilePage2Loading_showsOnlyNewFilterResults', async () => {
    let finishOldPage2: (value: RecipePage) => void = () => undefined;
    api.list.mockImplementation((filters: { search: string }, offset: number) => {
      if (filters.search === 'new') return Promise.resolve(page([recipe(1, 'New')], 1, null));
      if (offset === 0) return Promise.resolve(page(range(0, 24), 30, 24));
      return new Promise<RecipePage>((resolve) => {
        finishOldPage2 = resolve;
      });
    });
    await renderPage();
    observers.fire(true);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText('Search by name'), { target: { value: 'new' } });
    await screen.findByRole('heading', { name: 'New1' });
    finishOldPage2(page(range(24, 30), 30, null));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'R0' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { name: 'R29' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New1' })).toBeInTheDocument();
  });

  it('RecipesPage_shiftedOffsets_noDuplicateCards', async () => {
    // A recipe created while scrolled pushes R23 onto the next page as well.
    api.list.mockImplementation((_filters: unknown, offset: number) =>
      Promise.resolve(offset === 0 ? page(range(0, 24), 31, 24) : page(range(23, 31), 31, null)),
    );
    await renderPage();

    observers.fire(true);

    await screen.findByRole('heading', { name: 'R30' });
    expect(screen.getAllByRole('heading', { name: 'R23' })).toHaveLength(1);
  });

  it('RecipesPage_appendPage_existingCardsDoNotRerender', async () => {
    twoPages();
    await renderPage();
    const before = starRenders.get('R0');

    observers.fire(true);
    await screen.findByRole('heading', { name: 'R29' });

    expect(starRenders.get('R0')).toBe(before);
  });

  it('RecipesPage_rateARecipe_showsTheNewRating', async () => {
    twoPages();
    api.rate.mockResolvedValue({ ...recipe(0), rating: 4 });
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Rate R0 4 stars' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Rate R0 4 stars' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });

  it('RecipesPage_deleteARecipe_removesTheCardAndCountsDown', async () => {
    // The server forgets R0 once it is deleted, as the refetch will show.
    let deleted = false;
    api.list.mockImplementation((_filters: unknown, offset: number) => {
      const all = range(deleted ? 1 : 0, 30);
      return Promise.resolve(
        page(
          all.slice(offset, offset + 24),
          all.length,
          offset + 24 < all.length ? offset + 24 : null,
        ),
      );
    });
    api.delete.mockImplementation(() => {
      deleted = true;
      return Promise.resolve();
    });
    vi.stubGlobal('confirm', () => true);
    await renderPage();

    fireEvent.click(screen.getByLabelText('Delete R0'));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'R0' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/of 29 recipes/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('RecipesPage_pageInFlight_observerDoesNotRequestAgain', async () => {
    api.list.mockImplementation((_filters: unknown, offset: number) =>
      offset === 0 ? Promise.resolve(page(range(0, 24), 30, 24)) : new Promise(() => undefined),
    );
    await renderPage();
    observers.fire(true);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));

    observers.fire(true);
    observers.fire(true);

    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('RecipesPage_afterAFailedPage_observerStops', async () => {
    api.list.mockImplementation((_filters: unknown, offset: number) =>
      offset === 0
        ? Promise.resolve(page(range(0, 24), 30, 24))
        : Promise.reject(new Error('down')),
    );
    await renderPage();
    observers.fire(true);
    await screen.findByRole('button', { name: 'Try again' });
    const calls = api.list.mock.calls.length;

    observers.fire(true);

    expect(api.list).toHaveBeenCalledTimes(calls);
  });

  it('RecipesPage_deleteThenSentinelVisibleDuringRefetch_noStaleNextPage', async () => {
    let deleted = false;
    let finishRefetch: () => void = () => undefined;
    api.list.mockImplementation((_filters: unknown, offset: number) => {
      const all = range(deleted ? 1 : 0, 30);
      const result = page(
        all.slice(offset, offset + 24),
        all.length,
        offset + 24 < all.length ? offset + 24 : null,
      );
      if (!deleted) return Promise.resolve(result);
      return new Promise<RecipePage>((resolve) => {
        finishRefetch = () => resolve(result);
      });
    });
    api.delete.mockImplementation(() => {
      deleted = true;
      return Promise.resolve();
    });
    vi.stubGlobal('confirm', () => true);
    await renderPage();

    fireEvent.click(screen.getByLabelText('Delete R0'));
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(1));
    observers.fire(true);

    // Only the refetch of page 1 is in flight; no page was requested at the stale offset.
    expect(api.list.mock.calls.map((call: unknown[]) => call[1] as number)).toEqual([0, 0]);
    finishRefetch();
    vi.unstubAllGlobals();
  });
});
