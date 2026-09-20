import { Router } from 'express';
import { classifyIngredientSchema } from '@cocktail/shared';
import { parseOrThrow } from '../lib/validation.js';
import { ingredientService } from '../services/ingredientService.js';

export const ingredientsRouter = Router();

/** GET /api/ingredients — every known ingredient with its classification. */
ingredientsRouter.get('/', (_req, res) => {
  res.json(ingredientService.list());
});

/** PATCH /api/ingredients/:name — set the alcoholic classification. */
ingredientsRouter.patch('/:name', (req, res) => {
  const { isAlcoholic } = parseOrThrow(classifyIngredientSchema, req.body);
  const name = decodeURIComponent(req.params.name);
  res.json(ingredientService.classify(name, isAlcoholic));
});
