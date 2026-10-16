import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { recipeStore } from '../src/data/recipeStore.js';
import { db } from '../src/data/connection.js';
import type { Recipe, RecipePage } from '@cocktail/shared';

const app = createApp();
const SEEDED = 8;
const PAGE_BYTES_BUDGET = 15_000;
const BULK_ROWS = 33_000;
const BULK_TIMEOUT_MS = 60_000;

/** A recipe about the size of the seeded classics. */
function addRecipe(i: number, rating = 3): void {
  recipeStore.add({
    name: `House Sour ${String(i)}`,
    ingredients: [
      { name: 'bourbon', amount: '60ml' },
      { name: 'fresh lemon juice', amount: '25ml' },
      { name: 'simple syrup', amount: '15ml' },
      { name: 'egg white', amount: '1' },
    ],
    instructions: 'Dry shake, then shake hard with ice. Strain into a chilled coupe and garnish.',
    glassType: 'coupe',
    tags: ['sour', 'classic'],
    rating,
    isMocktail: false,
  });
}

const addMany = (n: number, rating?: number) =>
  db.transaction(() => {
    for (let i = 0; i < n; i++) addRecipe(i, rating);
  })();

const page = async (query: string) =>
  (await request(app).get(`/api/recipes?${query}`)).body as RecipePage;

beforeEach(() => {
  recipeStore.reset();
});

describe('GET /api/recipes pagination', () => {
  it('list_default_returns24ItemsWithTotalAndNextOffset', async () => {
    addMany(30);

    const body = await page('');

    expect(body.items).toHaveLength(24);
    expect(body.total).toBe(SEEDED + 30);
    expect(body.nextOffset).toBe(24);
  });

  it('list_lastPage_nextOffsetNull', async () => {
    addMany(30);

    const body = await page('offset=24');

    expect(body.items).toHaveLength(14);
    expect(body.nextOffset).toBeNull();
  });

  it('list_offsetPastEnd_emptyItems', async () => {
    const body = await page('offset=1000');

    expect(body).toEqual({ items: [], total: SEEDED, nextOffset: null });
  });

  it('list_limit48_accepted', async () => {
    const res = await request(app).get('/api/recipes?limit=48');

    expect(res.status).toBe(200);
  });

  it('list_limit49_returns400', async () => {
    const res = await request(app).get('/api/recipes?limit=49');

    expect(res.status).toBe(400);
  });

  it('list_offsetOverMax_returns400', async () => {
    const res = await request(app).get('/api/recipes?offset=100001');

    expect(res.status).toBe(400);
  });

  it('list_equalRatings_pagesDoNotOverlap', async () => {
    addMany(30, 4);
    const seen: Recipe[] = [];
    let offset: number | null = 0;

    while (offset !== null) {
      const body: RecipePage = await page(`sortBy=rating&limit=5&offset=${String(offset)}`);
      seen.push(...body.items);
      offset = body.nextOffset;
    }

    expect(new Set(seen.map((r) => r.id)).size).toBe(seen.length);
    expect(seen).toHaveLength(SEEDED + 30);
  });

  it('list_collectionFilter_totalCountsOnlyMembers', async () => {
    const created = await request(app).post('/api/collections').send({ name: 'Favourites' });
    const id = (created.body as { id: string }).id;
    await request(app).post(`/api/collections/${id}/recipes/1`);
    await request(app).post(`/api/collections/${id}/recipes/2`);

    const body = await page(`collectionId=${id}`);

    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
  });

  it(
    'list_33000Recipes_firstPageOk',
    async () => {
      addMany(BULK_ROWS);

      const res = await request(app).get('/api/recipes');

      expect(res.status).toBe(200);
      expect((res.body as RecipePage).items).toHaveLength(24);
    },
    BULK_TIMEOUT_MS,
  );

  it('list_firstPageOf24_bodyUnder15000Bytes', async () => {
    addMany(30);

    const res = await request(app).get('/api/recipes');

    expect(Buffer.byteLength(res.text)).toBeLessThan(PAGE_BYTES_BUDGET);
  });

  it('list_ifNoneMatch_returns304', async () => {
    const first = await request(app).get('/api/recipes');

    const second = await request(app)
      .get('/api/recipes')
      .set('If-None-Match', first.headers['etag'] as string);

    expect(second.status).toBe(304);
    expect(second.text).toBe('');
  });
});
