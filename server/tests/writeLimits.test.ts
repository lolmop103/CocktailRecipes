import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { adminAgent } from './helpers/admin.js';
import { createApp } from '../src/app.js';
import { recipeStore } from '../src/data/recipeStore.js';

const app = createApp();
/** Logged in as the admin, sending the allowed Origin — writes are guarded. */
let api: TestAgent;

beforeAll(async () => {
  api = await adminAgent(app);
});

/** A valid recipe body, with any field overridden. */
const recipe = (overrides: Record<string, unknown> = {}) => ({
  name: 'Gimlet',
  ingredients: [{ name: 'gin', amount: '60ml' }],
  ...overrides,
});
const ingredients = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `i${String(i)}` }));
const tags = (n: number) => Array.from({ length: n }, (_, i) => `t${String(i)}`);
const OVER_BODY_LIMIT = 70_000;

beforeEach(() => {
  recipeStore.reset();
});

describe('recipe write limits', () => {
  it('post_nameOf120Chars_created', async () => {
    const res = await api.post('/api/recipes').send(recipe({ name: 'a'.repeat(120) }));

    expect(res.status).toBe(201);
  });

  it('post_nameOf121Chars_returns400', async () => {
    const res = await api.post('/api/recipes').send(recipe({ name: 'a'.repeat(121) }));

    expect(res.status).toBe(400);
  });

  it('post_40Ingredients_created', async () => {
    const res = await api.post('/api/recipes').send(recipe({ ingredients: ingredients(40) }));

    expect(res.status).toBe(201);
  });

  it('post_41Ingredients_returns400', async () => {
    const res = await api.post('/api/recipes').send(recipe({ ingredients: ingredients(41) }));

    expect(res.status).toBe(400);
  });

  it('post_ingredientNameOf61Chars_returns400', async () => {
    const res = await api
      .post('/api/recipes')
      .send(recipe({ ingredients: [{ name: 'a'.repeat(61) }] }));

    expect(res.status).toBe(400);
  });

  it('post_amountOf31Chars_returns400', async () => {
    const res = await api
      .post('/api/recipes')
      .send(recipe({ ingredients: [{ name: 'gin', amount: 'a'.repeat(31) }] }));

    expect(res.status).toBe(400);
  });

  it('post_instructionsOf5000Chars_created', async () => {
    const res = await api.post('/api/recipes').send(recipe({ instructions: 'a'.repeat(5_000) }));

    expect(res.status).toBe(201);
  });

  it('post_instructionsOf5001Chars_returns400', async () => {
    const res = await api.post('/api/recipes').send(recipe({ instructions: 'a'.repeat(5_001) }));

    expect(res.status).toBe(400);
  });

  it('post_glassTypeOf41Chars_returns400', async () => {
    const res = await api.post('/api/recipes').send(recipe({ glassType: 'a'.repeat(41) }));

    expect(res.status).toBe(400);
  });

  it('post_21Tags_returns400', async () => {
    const res = await api.post('/api/recipes').send(recipe({ tags: tags(21) }));

    expect(res.status).toBe(400);
  });

  it('post_tagOf31Chars_returns400', async () => {
    const res = await api.post('/api/recipes').send(recipe({ tags: ['a'.repeat(31)] }));

    expect(res.status).toBe(400);
  });

  it('patch_nameOf121Chars_returns400', async () => {
    const res = await api.patch('/api/recipes/1').send({ name: 'a'.repeat(121) });

    expect(res.status).toBe(400);
  });

  it('patch_41Ingredients_returns400', async () => {
    const res = await api.patch('/api/recipes/1').send({ ingredients: ingredients(41) });

    expect(res.status).toBe(400);
  });

  it('post_bodyOver64KB_returns413', async () => {
    const res = await api.post('/api/recipes').send(recipe({ pad: 'a'.repeat(OVER_BODY_LIMIT) }));

    expect(res.status).toBe(413);
  });

  it('post_urlencodedBody_returns400', async () => {
    const res = await api
      .post('/api/recipes')
      .type('form')
      .send('name=Gimlet&ingredients[0][name]=gin');

    expect(res.status).toBe(400);
  });
});

describe('collection and ingredient write limits', () => {
  it('collections_post_nameOf60Chars_created', async () => {
    const res = await api.post('/api/collections').send({ name: 'a'.repeat(60) });

    expect(res.status).toBe(201);
  });

  it('collections_post_nameOf61Chars_returns400', async () => {
    const res = await api.post('/api/collections').send({ name: 'a'.repeat(61) });

    expect(res.status).toBe(400);
  });

  it('ingredients_patch_nameOf61Chars_returns400', async () => {
    const res = await api.patch(`/api/ingredients/${'a'.repeat(61)}`).send({ isAlcoholic: true });

    expect(res.status).toBe(400);
  });
});

describe('ingredient names with a percent sign', () => {
  it('ingredients_patch_percentInName_classifiesTheLiteralName', async () => {
    await api.post('/api/recipes').send(recipe({ ingredients: [{ name: '100% agave' }] }));

    const res = await api
      .patch(`/api/ingredients/${encodeURIComponent('100% agave')}`)
      .send({ isAlcoholic: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: '100% agave', isAlcoholic: true });
  });
});
