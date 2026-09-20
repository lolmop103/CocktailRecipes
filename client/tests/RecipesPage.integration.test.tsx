import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './testUtils.js';
import type { Recipe, Collection, IngredientMeta } from '../src/features/Recipes/types/index.js';

const api = {
  list: vi.fn(),
  get: vi.fn(),
  getIngredients: vi.fn(),
  getCollections: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  rate: vi.fn(),
  updateIngredientMeta: vi.fn(),
  createCollection: vi.fn(),
  addToCollection: vi.fn(),
  removeFromCollection: vi.fn(),
  deleteCollection: vi.fn(),
};

vi.mock('../src/features/Recipes/services/api.js', () => ({
  recipesApi: api,
  ApiError: class ApiError extends Error {
    fieldErrors: { path: string; message: string }[] = [];
  },
}));

const { RecipesPage } = await import('../src/features/Recipes/RecipesPage.js');

const MOJITO: Recipe = {
  id: '1',
  name: 'Mojito',
  ingredients: [{ name: 'white rum', amount: '60ml' }],
  isMocktail: false,
  rating: 4,
};

const INGREDIENTS: IngredientMeta[] = [
  { name: 'white rum', isAlcoholic: true },
  { name: 'soda water', isAlcoholic: false },
];
const PARTY: Collection = { id: '1', name: 'Party', recipeIds: ['1'] };

/** Filters passed to the most recent list() call. */
function lastFilters() {
  return api.list.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue([MOJITO]);
  api.getIngredients.mockResolvedValue(INGREDIENTS);
  api.getCollections.mockResolvedValue([PARTY]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderPage(route = '/cocktails') {
  const view = renderWithProviders(<RecipesPage tab="cocktail" />, { route });
  await screen.findByText('Mojito');
  return view;
}

describe('RecipesPage — rendering', () => {
  it('renders_recipesFromTheApi', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: 'Mojito' })).toBeInTheDocument();
  });

  it('wires_tablistToThePanel', async () => {
    await renderPage();

    const panel = screen.getByRole('tabpanel');
    const activeTab = screen.getByRole('tab', { selected: true });
    expect(panel).toHaveAttribute('id', activeTab.getAttribute('aria-controls'));
  });

  it('showsEmptyState_whenNothingMatches', async () => {
    api.list.mockResolvedValue([]);
    renderWithProviders(<RecipesPage tab="cocktail" />);

    expect(await screen.findByText(/No recipes match your filters/)).toBeInTheDocument();
  });

  it('showsError_whenRecipesFailToLoad', async () => {
    api.list.mockRejectedValue(new Error('down'));
    renderWithProviders(<RecipesPage tab="cocktail" />);

    expect(await screen.findByText(/Could not load recipes/)).toBeInTheDocument();
  });

  it('showsError_whenCollectionsFailToLoad', async () => {
    api.getCollections.mockRejectedValue(new Error('down'));
    await renderPage();

    expect(await screen.findByText(/Could not load collections/)).toBeInTheDocument();
  });
});

describe('RecipesPage — filter state lives in the URL', () => {
  it('appliesSearchTerm_fromTheQueryString', async () => {
    await renderPage('/cocktails?q=negroni');

    await waitFor(() => expect(lastFilters()).toMatchObject({ search: 'negroni' }));
  });

  it('appliesIngredientsAndSort_fromTheQueryString', async () => {
    await renderPage('/cocktails?ingredients=gin,lime&sortBy=rating&sortOrder=desc&rating=4');

    await waitFor(() =>
      expect(lastFilters()).toMatchObject({
        ingredients: ['gin', 'lime'],
        sortBy: 'rating',
        sortOrder: 'desc',
        minRating: 4,
      }),
    );
  });

  it('ignores_outOfRangeRating_inTheUrl', async () => {
    await renderPage('/cocktails?rating=99');

    await waitFor(() => expect(lastFilters()['minRating']).toBeUndefined());
  });

  it('fallsBackToDefaults_forUnknownSortValues', async () => {
    await renderPage('/cocktails?sortBy=bogus&sortOrder=sideways');

    await waitFor(() => expect(lastFilters()).toMatchObject({ sortBy: 'name', sortOrder: 'asc' }));
  });

  it('requestsMocktails_onTheMocktailRoute', async () => {
    api.list.mockResolvedValue([]);
    renderWithProviders(<RecipesPage tab="mocktail" />, { route: '/mocktails' });

    await waitFor(() => expect(lastFilters()).toMatchObject({ isMocktail: true }));
  });

  it('drops_alcoholicIngredients_fromTheMocktailRequest', async () => {
    api.list.mockResolvedValue([]);
    renderWithProviders(<RecipesPage tab="mocktail" />, {
      route: '/mocktails?ingredients=white rum,soda water',
    });

    // Filtered out of the request, but still present in the URL for the trip back.
    await waitFor(() => expect(lastFilters()).toMatchObject({ ingredients: ['soda water'] }));
  });
});

describe('RecipesPage — writes', () => {
  it('deletesRecipe_afterConfirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockResolvedValue(undefined);
    await renderPage();

    fireEvent.click(screen.getByLabelText('Delete Mojito'));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('1'));
  });

  it('reportsError_whenDeleteFails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockRejectedValue(new Error('boom'));
    await renderPage();

    fireEvent.click(screen.getByLabelText('Delete Mojito'));

    expect(await screen.findByText(/Could not delete that recipe/)).toBeInTheDocument();
  });

  it('doesNothing_whenDeleteNotConfirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderPage();

    fireEvent.click(screen.getByLabelText('Delete Mojito'));

    expect(api.delete).not.toHaveBeenCalled();
  });

  it('sendsRating_whenAStarIsClicked', async () => {
    api.rate.mockResolvedValue({ ...MOJITO, rating: 5 });
    await renderPage();

    fireEvent.click(screen.getByLabelText('Rate Mojito 5 stars'));

    await waitFor(() => expect(api.rate).toHaveBeenCalledWith('1', 5));
  });

  it('refetchesRecipes_afterCreate_ratherThanAppending', async () => {
    api.create.mockResolvedValue({ ...MOJITO, id: '2', name: 'Negroni' });
    await renderPage();
    const before = api.list.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: '+ New Recipe' }));
    const dialog = screen.getByRole('dialog', { name: 'Add new recipe' });
    fireEvent.change(within(dialog).getByLabelText('Name *'), { target: { value: 'Negroni' } });
    fireEvent.change(within(dialog).getByLabelText('Ingredient 1 name'), {
      target: { value: 'white rum' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Recipe' }));

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    // Only the server knows whether the new recipe matches the active filters.
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(before));
  });

  it('sendsNullForClearedFields_whenSavingAnEdit', async () => {
    api.update.mockResolvedValue(MOJITO);
    await renderPage();

    fireEvent.click(screen.getByLabelText('Edit Mojito'));
    const dialog = screen.getByRole('dialog', { name: 'Edit recipe' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update.mock.calls[0]?.[1]).toMatchObject({
      instructions: null,
      glassType: null,
      tags: null,
    });
  });
});

describe('RecipesPage — collections', () => {
  it('addsRecipe_toACollection', async () => {
    api.getCollections.mockResolvedValue([{ id: '1', name: 'Party', recipeIds: [] }]);
    api.addToCollection.mockResolvedValue({ id: '1', name: 'Party', recipeIds: ['1'] });
    await renderPage();

    fireEvent.click(screen.getByLabelText('Add Mojito to a collection'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Party' }));

    await waitFor(() => expect(api.addToCollection).toHaveBeenCalledWith('1', '1'));
  });

  it('removesRecipe_fromACollectionItIsAlreadyIn', async () => {
    api.removeFromCollection.mockResolvedValue({ id: '1', name: 'Party', recipeIds: [] });
    await renderPage();

    fireEvent.click(screen.getByLabelText('Add Mojito to a collection'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Party' }));

    await waitFor(() => expect(api.removeFromCollection).toHaveBeenCalledWith('1', '1'));
  });

  it('createsCollection_fromThePicker', async () => {
    api.createCollection.mockResolvedValue({ id: '2', name: 'Summer', recipeIds: [] });
    await renderPage();

    fireEvent.click(screen.getByLabelText('Add Mojito to a collection'));
    fireEvent.change(screen.getByLabelText('New collection name'), {
      target: { value: 'Summer' },
    });
    fireEvent.click(screen.getByLabelText('Create collection'));

    await waitFor(() => expect(api.createCollection).toHaveBeenCalledWith('Summer'));
  });
});

describe('RecipesPage — add recipe modal', () => {
  it('opens_andClosesOnCancel', async () => {
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: '+ New Recipe' }));
    const dialog = screen.getByRole('dialog', { name: 'Add new recipe' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closesOnEscape', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: '+ New Recipe' }));

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens_editDialog_prefilledWithTheRecipe', async () => {
    await renderPage();

    fireEvent.click(screen.getByLabelText('Edit Mojito'));

    const dialog = screen.getByRole('dialog', { name: 'Edit recipe' });
    expect(within(dialog).getByLabelText('Name *')).toHaveValue('Mojito');
    expect(within(dialog).getByLabelText('Ingredient 1 name')).toHaveValue('white rum');
    expect(within(dialog).getByLabelText('Ingredient 1 amount')).toHaveValue(60);
  });
});

describe('RecipesPage — exclude ingredients', () => {
  it('readsExcludeList_fromTheUrl', async () => {
    await renderPage('/cocktails?exclude=egg white,rum');

    await waitFor(() =>
      expect(lastFilters()).toMatchObject({ excludeIngredients: ['egg white', 'rum'] }),
    );
  });

  it('rendersAWithoutPicker_alongsideTheIncludePicker', async () => {
    await renderPage();

    expect(screen.getByLabelText('Search ingredients')).toBeInTheDocument();
    expect(screen.getByLabelText('Search without')).toBeInTheDocument();
  });

  it('writesExclusion_backIntoTheUrl', async () => {
    await renderPage();

    const input = screen.getByLabelText('Search without');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'soda' } });
    fireEvent.mouseDown(await screen.findByRole('option', { name: 'soda water' }));

    // MemoryRouter keeps its own history, so assert on what the round trip
    // through the URL produced rather than on window.location.
    await waitFor(() =>
      expect(lastFilters()).toMatchObject({ excludeIngredients: ['soda water'] }),
    );
  });

  it('hides_anIncludedIngredient_fromTheExcludePicker', async () => {
    await renderPage('/cocktails?ingredients=soda water');

    fireEvent.focus(screen.getByLabelText('Search without'));

    // Requiring and excluding the same ingredient can only return nothing.
    expect(screen.queryByRole('option', { name: 'soda water' })).not.toBeInTheDocument();
  });

  it('hides_anExcludedIngredient_fromTheIncludePicker', async () => {
    await renderPage('/cocktails?exclude=soda water');

    fireEvent.focus(screen.getByLabelText('Search ingredients'));

    expect(screen.queryByRole('option', { name: 'soda water' })).not.toBeInTheDocument();
  });

  it('clearsExclusions_onReset', async () => {
    await renderPage('/cocktails?exclude=soda water');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(lastFilters()).toMatchObject({ excludeIngredients: [] }));
  });
});

describe('RecipesPage — tab navigation', () => {
  it('carriesFilters_acrossATabSwitch', async () => {
    await renderPage('/cocktails?q=mojito&exclude=soda water');

    fireEvent.click(screen.getByRole('tab', { name: /Mocktails/ }));

    // Reading window.location here instead of the router's location would drop
    // the query string under any non-browser history.
    await waitFor(() =>
      expect(lastFilters()).toMatchObject({
        search: 'mojito',
        excludeIngredients: ['soda water'],
      }),
    );
  });
});
