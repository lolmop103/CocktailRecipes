/**
 * Regression tests for defects found in the 2026-09 code review.
 * Each case failed before the corresponding fix.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { recipeStore } from '../src/data/recipeStore.js';

const app = createApp();

describe('PATCH /api/recipes/:id — clearable fields', () => {
  beforeEach(() => recipeStore.reset());

  it('clears_optionalFields_whenSentAsNull', async () => {
    const res = await request(app)
      .patch('/api/recipes/1')
      .send({ instructions: null, glassType: null, tags: null });

    expect(res.status).toBe(200);
    expect(res.body.instructions).toBeUndefined();
    expect(res.body.glassType).toBeUndefined();
    expect(res.body.tags).toBeUndefined();
  });

  it('leaves_omittedFields_unchanged', async () => {
    const res = await request(app).patch('/api/recipes/1').send({ name: 'Mojito Reserva' });

    expect(res.body.name).toBe('Mojito Reserva');
    expect(res.body.glassType).toBe('highball');
    expect(res.body.tags).toEqual(['refreshing', 'rum', 'summery']);
  });

  it('preserves_rating_whenNotIncludedInPatch', async () => {
    const res = await request(app).patch('/api/recipes/1').send({ name: 'Mojito' });
    expect(res.body.rating).toBe(4);
  });
});

describe('id allocation', () => {
  beforeEach(() => recipeStore.reset());

  it('neverReuses_idOfDeletedRecipe', async () => {
    await request(app).delete('/api/recipes/8'); // the highest seeded id
    const created = await request(app)
      .post('/api/recipes')
      .send({ name: 'New Drink', ingredients: [{ name: 'water' }] });

    expect(created.status).toBe(201);
    expect(created.body.id).toBe('9');
  });

  it('neverReuses_idOfDeletedCollection', async () => {
    const first = await request(app).post('/api/collections').send({ name: 'Party' });
    await request(app).delete(`/api/collections/${first.body.id}`);
    const second = await request(app).post('/api/collections').send({ name: 'Summer' });

    expect(second.body.id).not.toBe(first.body.id);
  });
});

describe('error responses', () => {
  beforeEach(() => recipeStore.reset());

  it('returns_structuredFieldErrors_withoutLeakingZodInternals', async () => {
    const res = await request(app).post('/api/recipes').send({ name: '', ingredients: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'name' })]),
    );
    expect(JSON.stringify(res.body)).not.toContain('too_small');
  });

  it('returns_json404_forUnknownApiRoute', async () => {
    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.status).toBe(404);
  });

  it('returns_404_whenAddingUnknownRecipeToCollection', async () => {
    const collection = await request(app).post('/api/collections').send({ name: 'Party' });
    const res = await request(app).post(`/api/collections/${collection.body.id}/recipes/99999`);

    expect(res.status).toBe(404);
  });
});
