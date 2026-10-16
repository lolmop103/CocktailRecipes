import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils.js';
import { installIntersectionObserverStub, type ObserverStub } from './intersectionObserverStub.js';
import type { Recipe, RecipePage } from '../src/features/Recipes/types/index.js';

const api = {
  list: vi.fn(),
  getIngredients: vi.fn(),
  getCollections: vi.fn(),
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
  const original =
    await importOriginal<typeof import('../src/features/Recipes/components/StarRating.js')>();
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
});
