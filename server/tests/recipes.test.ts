import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { recipeStore } from '../src/data/recipeStore.js';
import type { Recipe } from '@cocktail/shared';

const app = createApp();

beforeEach(() => {
  recipeStore.reset();
});

describe('GET /api/recipes', () => {
  it('returns_allRecipes_byDefault', async () => {
    const res = await request(app).get('/api/recipes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('search_returnsMachingRecipes', async () => {
    const res = await request(app).get('/api/recipes?search=negroni');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Negroni');
  });

  it('ingredients_include_filtersCorrectly', async () => {
    const res = await request(app).get('/api/recipes?ingredients=gin');
    expect(res.status).toBe(200);
    const recipes = res.body as Recipe[];
    expect(recipes.map((r) => r.name)).toContain('Negroni');
    expect(
      recipes.every((r) => r.ingredients.some((i) => i.name.toLowerCase().includes('gin'))),
    ).toBe(true);
  });

  it('excludeIngredients_filtersOut', async () => {
    const res = await request(app).get('/api/recipes?excludeIngredients=rum');
    expect(res.status).toBe(200);
    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).not.toContain('Mojito');
    expect(names).not.toContain('Daiquiri');
  });

  it('minRating_filtersOutBelow', async () => {
    const res = await request(app).get('/api/recipes?minRating=5');
    expect(res.status).toBe(200);
    res.body.forEach((r: { rating: number }) => {
      expect(r.rating).toBe(5);
    });
  });

  it('sortBy_ingredientCount_asc', async () => {
    const res = await request(app).get('/api/recipes?sortBy=ingredientCount&sortOrder=asc');
    expect(res.status).toBe(200);
    const counts = res.body.map((r: { ingredients: unknown[] }) => r.ingredients.length);
    for (let i = 0; i < counts.length - 1; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i + 1]);
    }
  });

  it('invalidSortBy_returns400', async () => {
    const res = await request(app).get('/api/recipes?sortBy=invalid');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/recipes/:id', () => {
  it('returns_recipe_whenExists', async () => {
    const res = await request(app).get('/api/recipes/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('1');
  });

  it('returns_404_whenNotFound', async () => {
    const res = await request(app).get('/api/recipes/999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/recipes', () => {
  it('creates_recipe_withRequiredFields', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .send({ name: 'Test Cocktail', ingredients: [{ name: 'vodka', amount: '50ml' }] });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Cocktail');
    expect(res.body.id).toBeDefined();
  });

  it('returns_400_withoutName', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .send({ ingredients: [{ name: 'vodka' }] });
    expect(res.status).toBe(400);
  });

  it('returns_400_withoutIngredients', async () => {
    const res = await request(app).post('/api/recipes').send({ name: 'Empty' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/recipes/:id/rating', () => {
  it('updates_rating_successfully', async () => {
    const res = await request(app).patch('/api/recipes/1/rating').send({ rating: 5 });
    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(5);
  });

  it('returns_400_forInvalidRating', async () => {
    const res = await request(app).patch('/api/recipes/1/rating').send({ rating: 10 });
    expect(res.status).toBe(400);
  });

  it('returns_404_forUnknownId', async () => {
    const res = await request(app).patch('/api/recipes/999/rating').send({ rating: 4 });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/recipes/:id', () => {
  it('updates_name_andIngredients', async () => {
    const res = await request(app)
      .patch('/api/recipes/1')
      .send({ name: 'Mojito Remix', ingredients: [{ name: 'white rum', amount: '90ml' }] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Mojito Remix');
    expect(res.body.ingredients[0].amount).toBe('90ml');
  });

  it('partial_update_preserves_other_fields', async () => {
    const before = await request(app).get('/api/recipes/2');
    const res = await request(app).patch('/api/recipes/2').send({ name: 'Super Negroni' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Super Negroni');
    expect(res.body.ingredients).toEqual(before.body.ingredients);
  });

  it('returns_404_forUnknownId', async () => {
    const res = await request(app).patch('/api/recipes/999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/recipes/:id', () => {
  it('removes_recipe_andReturns204', async () => {
    const del = await request(app).delete('/api/recipes/1');
    expect(del.status).toBe(204);
    const get = await request(app).get('/api/recipes/1');
    expect(get.status).toBe(404);
  });

  it('returns_404_forUnknownId', async () => {
    const res = await request(app).delete('/api/recipes/999');
    expect(res.status).toBe(404);
  });
});
