import { Router } from 'express';
import { createCollectionSchema } from '@cocktail/shared';
import { parseOrThrow } from '../lib/validation.js';
import { collectionService } from '../services/collectionService.js';

export const collectionsRouter = Router();

// GET /api/collections
collectionsRouter.get('/', (_req, res) => {
  res.json(collectionService.list());
});

// POST /api/collections
collectionsRouter.post('/', (req, res) => {
  const { name } = parseOrThrow(createCollectionSchema, req.body);
  res.status(201).json(collectionService.create(name));
});

// POST /api/collections/:id/recipes/:recipeId
collectionsRouter.post('/:id/recipes/:recipeId', (req, res) => {
  res.json(collectionService.addRecipe(req.params.id, req.params.recipeId));
});

// DELETE /api/collections/:id/recipes/:recipeId
collectionsRouter.delete('/:id/recipes/:recipeId', (req, res) => {
  res.json(collectionService.removeRecipe(req.params.id, req.params.recipeId));
});

// DELETE /api/collections/:id
collectionsRouter.delete('/:id', (req, res) => {
  collectionService.remove(req.params.id);
  res.status(204).send();
});
