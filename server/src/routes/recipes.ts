import { Router } from 'express';
import {
  createRecipeSchema,
  ratingSchema,
  recipeQuerySchema,
  updateRecipeSchema,
} from '@cocktail/shared';
import { parseOrThrow } from '../lib/validation.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { recipeService } from '../services/recipeService.js';

export const recipesRouter = Router();

// GET /api/recipes
recipesRouter.get('/', (req, res) => {
  res.json(recipeService.list(parseOrThrow(recipeQuerySchema, req.query)));
});

// GET /api/recipes/:id
recipesRouter.get('/:id', (req, res) => {
  res.json(recipeService.getById(req.params.id));
});

// POST /api/recipes
recipesRouter.post('/', requireAdmin, (req, res) => {
  const input = parseOrThrow(createRecipeSchema, req.body);
  res.status(201).json(recipeService.create(input));
});

// PATCH /api/recipes/:id
recipesRouter.patch('/:id', requireAdmin, (req, res) => {
  const input = parseOrThrow(updateRecipeSchema, req.body);
  res.json(recipeService.update(req.params.id, input));
});

// PATCH /api/recipes/:id/rating
recipesRouter.patch('/:id/rating', requireAdmin, (req, res) => {
  const { rating } = parseOrThrow(ratingSchema, req.body);
  res.json(recipeService.rate(req.params.id, rating));
});

// DELETE /api/recipes/:id
recipesRouter.delete('/:id', requireAdmin, (req, res) => {
  recipeService.remove(req.params.id);
  res.status(204).end();
});
