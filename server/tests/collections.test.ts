import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collectionStore } from '../src/data/collectionStore.js';

const app = createApp();

beforeEach(() => {
  collectionStore.reset();
});

// ---------------------------------------------------------------------------
describe('GET /api/collections', () => {
  it('returns_emptyArray_byDefault', async () => {
    const res = await request(app).get('/api/collections');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns_allCollections_sortedByName', async () => {
    collectionStore.create('Party');
    collectionStore.create('Favourites');
    const res = await request(app).get('/api/collections');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Favourites');
    expect(res.body[1].name).toBe('Party');
  });

  it('includes_recipeIds_array', async () => {
    collectionStore.create('Test');
    const res = await request(app).get('/api/collections');
    expect(res.body[0].recipeIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/collections', () => {
  it('creates_collection_withName', async () => {
    const res = await request(app).post('/api/collections').send({ name: 'My Cocktails' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Cocktails');
    expect(res.body.id).toBeDefined();
    expect(res.body.recipeIds).toEqual([]);
  });

  it('returns_400_withoutName', async () => {
    const res = await request(app).post('/api/collections').send({});
    expect(res.status).toBe(400);
  });

  it('returns_400_withEmptyName', async () => {
    const res = await request(app).post('/api/collections').send({ name: '' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/collections/:id/recipes/:recipeId', () => {
  it('adds_recipe_toCollection', async () => {
    const col = collectionStore.create('Favourites');
    const res = await request(app).post(`/api/collections/${col.id}/recipes/1`);
    expect(res.status).toBe(200);
    expect(res.body.recipeIds).toContain('1');
  });

  it('idempotent_whenRecipeAlreadyInCollection', async () => {
    const col = collectionStore.create('Favourites');
    await request(app).post(`/api/collections/${col.id}/recipes/1`);
    const res = await request(app).post(`/api/collections/${col.id}/recipes/1`);
    expect(res.status).toBe(200);
    expect(res.body.recipeIds.filter((id: string) => id === '1')).toHaveLength(1);
  });

  it('returns_404_forUnknownCollection', async () => {
    const res = await request(app).post('/api/collections/999/recipes/1');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('DELETE /api/collections/:id/recipes/:recipeId', () => {
  it('removes_recipe_fromCollection', async () => {
    const col = collectionStore.create('Favourites');
    collectionStore.addRecipe(col.id, '1');
    const res = await request(app).delete(`/api/collections/${col.id}/recipes/1`);
    expect(res.status).toBe(200);
    expect(res.body.recipeIds).not.toContain('1');
  });

  it('noop_whenRecipeNotInCollection', async () => {
    const col = collectionStore.create('Empty');
    const res = await request(app).delete(`/api/collections/${col.id}/recipes/99`);
    expect(res.status).toBe(200);
    expect(res.body.recipeIds).toEqual([]);
  });

  it('returns_404_forUnknownCollection', async () => {
    const res = await request(app).delete('/api/collections/999/recipes/1');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('DELETE /api/collections/:id', () => {
  it('deletes_collection_andReturns204', async () => {
    const col = collectionStore.create('Temp');
    const del = await request(app).delete(`/api/collections/${col.id}`);
    expect(del.status).toBe(204);
    const get = await request(app).get('/api/collections');
    expect(get.body.find((c: { id: string }) => c.id === col.id)).toBeUndefined();
  });

  it('returns_404_forUnknownCollection', async () => {
    const res = await request(app).delete('/api/collections/999');
    expect(res.status).toBe(404);
  });
});
