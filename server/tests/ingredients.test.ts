import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ingredientMetaStore } from '../src/data/ingredientMetaStore.js';

const app = createApp();

beforeEach(() => {
  ingredientMetaStore.reset();
});

// ---------------------------------------------------------------------------
describe('GET /api/ingredients', () => {
  it('returns_seededIngredients', async () => {
    const res = await request(app).get('/api/ingredients');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('includes_isAlcoholic_field', async () => {
    const res = await request(app).get('/api/ingredients');
    const gin = res.body.find((i: { name: string }) => i.name === 'gin');
    expect(gin).toBeDefined();
    expect(gin.isAlcoholic).toBe(true);
    const sodaWater = res.body.find((i: { name: string }) => i.name === 'soda water');
    expect(sodaWater).toBeDefined();
    expect(sodaWater.isAlcoholic).toBe(false);
  });

  it('returns_resultsSortedByName', async () => {
    const res = await request(app).get('/api/ingredients');
    const names: string[] = res.body.map((i: { name: string }) => i.name);
    const sorted = names.toSorted((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
describe('PATCH /api/ingredients/:name', () => {
  it('updates_isAlcoholic_toFalse', async () => {
    const res = await request(app).patch('/api/ingredients/gin').send({ isAlcoholic: false });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('gin');
    expect(res.body.isAlcoholic).toBe(false);
  });

  it('updates_isAlcoholic_toTrue', async () => {
    const encodedName = encodeURIComponent('soda water');
    const res = await request(app)
      .patch(`/api/ingredients/${encodedName}`)
      .send({ isAlcoholic: true });
    expect(res.status).toBe(200);
    expect(res.body.isAlcoholic).toBe(true);
  });

  it('creates_newIngredient_whenNotInSeed', async () => {
    const res = await request(app)
      .patch('/api/ingredients/elderflower-cordial')
      .send({ isAlcoholic: false });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('elderflower-cordial');
    expect(res.body.isAlcoholic).toBe(false);
  });

  it('urlDecodes_ingredientName', async () => {
    const res = await request(app)
      .patch(`/api/ingredients/${encodeURIComponent('fresh lime juice')}`)
      .send({ isAlcoholic: true });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('fresh lime juice');
  });

  it('returns_400_whenIsAlcoholicIsNotBoolean', async () => {
    const res = await request(app).patch('/api/ingredients/gin').send({ isAlcoholic: 'yes' });
    expect(res.status).toBe(400);
  });

  it('returns_400_whenBodyIsMissing', async () => {
    const res = await request(app).patch('/api/ingredients/gin').send({});
    expect(res.status).toBe(400);
  });
});
