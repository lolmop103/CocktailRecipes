import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recipesApi, ApiError } from '../src/features/Recipes/services/api.js';
import type { RecipeFilters } from '../src/features/Recipes/types/index.js';

const BASE_FILTERS: RecipeFilters = {
  search: '',
  ingredients: [],
  excludeIngredients: [],
  onlySelectedIngredients: false,
  minRating: undefined,
  sortBy: 'name',
  sortOrder: 'asc',
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Test',
    json: () => Promise.resolve(body),
  } as Response;
}

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The request URL the api layer actually built. */
function requestedUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  return String(fetchMock.mock.calls[0]?.[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recipesApi.list — query building', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch(jsonResponse([]));
  });

  it('omits_emptyFilters_fromQueryString', async () => {
    await recipesApi.list(BASE_FILTERS);

    const url = requestedUrl(fetchMock);
    expect(url).not.toContain('search=');
    expect(url).not.toContain('ingredients=');
    expect(url).not.toContain('minRating=');
  });

  it('alwaysSends_sortParameters', async () => {
    await recipesApi.list(BASE_FILTERS);

    const url = requestedUrl(fetchMock);
    expect(url).toContain('sortBy=name');
    expect(url).toContain('sortOrder=asc');
  });

  it('joins_ingredients_withCommas', async () => {
    await recipesApi.list({ ...BASE_FILTERS, ingredients: ['gin', 'lime juice'] });

    // URLSearchParams encodes a space as '+', which Express/qs decodes back to a space.
    expect(requestedUrl(fetchMock)).toContain('ingredients=gin%2Clime+juice');
  });

  it('sends_onlySelectedIngredients_onlyWhenIngredientsChosen', async () => {
    await recipesApi.list({ ...BASE_FILTERS, onlySelectedIngredients: true });

    // The flag is meaningless with an empty ingredient list, so it is dropped.
    expect(requestedUrl(fetchMock)).not.toContain('onlySelectedIngredients');
  });

  it('sends_collectionId_soFilteringHappensServerSide', async () => {
    await recipesApi.list({ ...BASE_FILTERS, collectionId: '7' });

    expect(requestedUrl(fetchMock)).toContain('collectionId=7');
  });

  it('forwards_abortSignal_toFetch', async () => {
    const controller = new AbortController();

    await recipesApi.list(BASE_FILTERS, controller.signal);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });
});

describe('recipesApi — error handling', () => {
  it('throws_apiError_carryingServerFieldErrors', async () => {
    mockFetch(
      jsonResponse(
        {
          status: 400,
          message: 'Validation failed',
          errors: [{ path: 'name', message: 'String must contain at least 1 character(s)' }],
        },
        400,
      ),
    );

    const failure = recipesApi.create({ name: '', ingredients: [], isMocktail: false });

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await failure.catch((err: ApiError) => {
      expect(err.status).toBe(400);
      expect(err.message).toBe('Validation failed');
      expect(err.fieldErrors).toEqual([
        { path: 'name', message: 'String must contain at least 1 character(s)' },
      ]);
    });
  });

  it('fallsBackTo_statusText_whenErrorBodyIsNotJson', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new Error('not json')),
      }),
    );

    await expect(recipesApi.getIngredients()).rejects.toThrow('Bad Gateway');
  });

  it('exposes_emptyFieldErrors_whenServerSentNone', async () => {
    mockFetch(jsonResponse({ status: 404, message: 'Recipe not found' }, 404));

    await recipesApi.get('999').catch((err: ApiError) => {
      expect(err.fieldErrors).toEqual([]);
    });
  });
});

describe('recipesApi — response handling', () => {
  it('doesNotParseBody_on204NoContent', async () => {
    const json = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, statusText: '', json }),
    );

    await expect(recipesApi.delete('1')).resolves.toBeUndefined();
    // A 204 has no body; calling .json() on it would throw.
    expect(json).not.toHaveBeenCalled();
  });

  it('encodes_ingredientNames_withSpacesAndAccents', async () => {
    const fetchMock = mockFetch(jsonResponse({ name: 'crème de cassis', isAlcoholic: true }));

    await recipesApi.updateIngredientMeta('crème de cassis', true);

    expect(requestedUrl(fetchMock)).toBe('/api/ingredients/cr%C3%A8me%20de%20cassis');
  });

  it('sends_jsonContentType_onWrites', async () => {
    const fetchMock = mockFetch(jsonResponse({}));

    await recipesApi.rate('1', 5);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 5 }),
    });
  });
});

describe('recipesApi — remaining endpoints', () => {
  it('get_fetchesSingleRecipe_byId', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: '1' }));

    await recipesApi.get('1');

    expect(requestedUrl(fetchMock)).toBe('/api/recipes/1');
  });

  it('update_patchesRecipe_withNullableFields', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: '1' }));
    const payload = {
      name: 'Mojito',
      ingredients: [{ name: 'white rum' }],
      instructions: null,
      glassType: null,
      tags: null,
      isMocktail: false,
    };

    await recipesApi.update('1', payload);

    expect(requestedUrl(fetchMock)).toBe('/api/recipes/1');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  });

  it('getCollections_fetchesTheList', async () => {
    const fetchMock = mockFetch(jsonResponse([]));

    await recipesApi.getCollections();

    expect(requestedUrl(fetchMock)).toBe('/api/collections');
  });

  it('createCollection_postsTheName', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: '1', name: 'Party', recipeIds: [] }));

    await recipesApi.createCollection('Party');

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ name: 'Party' }),
    });
  });

  it('addToCollection_postsToTheMembershipRoute', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: '1', name: 'Party', recipeIds: ['2'] }));

    await recipesApi.addToCollection('1', '2');

    expect(requestedUrl(fetchMock)).toBe('/api/collections/1/recipes/2');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('removeFromCollection_deletesTheMembership', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: '1', name: 'Party', recipeIds: [] }));

    await recipesApi.removeFromCollection('1', '2');

    expect(requestedUrl(fetchMock)).toBe('/api/collections/1/recipes/2');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('deleteCollection_sendsDelete_andExpectsNoBody', async () => {
    const fetchMock = mockFetch({ ok: true, status: 204, json: vi.fn() } as unknown as Response);

    await expect(recipesApi.deleteCollection('1')).resolves.toBeUndefined();
    expect(requestedUrl(fetchMock)).toBe('/api/collections/1');
  });
});

describe('recipesApi.list — exclude filter', () => {
  it('sends_excludeIngredients_whenChosen', async () => {
    const fetchMock = mockFetch(jsonResponse([]));

    await recipesApi.list({ ...BASE_FILTERS, excludeIngredients: ['rum', 'egg white'] });

    expect(requestedUrl(fetchMock)).toContain('excludeIngredients=rum%2Cegg+white');
  });

  it('omits_excludeIngredients_whenEmpty', async () => {
    const fetchMock = mockFetch(jsonResponse([]));

    await recipesApi.list(BASE_FILTERS);

    expect(requestedUrl(fetchMock)).not.toContain('excludeIngredients');
  });

  it('sends_includeAndExclude_together', async () => {
    const fetchMock = mockFetch(jsonResponse([]));

    await recipesApi.list({
      ...BASE_FILTERS,
      ingredients: ['gin'],
      excludeIngredients: ['egg white'],
    });

    const url = requestedUrl(fetchMock);
    expect(url).toContain('ingredients=gin');
    expect(url).toContain('excludeIngredients=egg+white');
  });
});
