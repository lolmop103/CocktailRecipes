import { Router } from 'express';
import { classifyIngredientSchema, ingredientNameParamSchema } from '@cocktail/shared';
import { parseOrThrow } from '../lib/validation.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { ingredientService } from '../services/ingredientService.js';

export const ingredientsRouter = Router();

/** GET /api/ingredients — every known ingredient with its classification. */
ingredientsRouter.get('/', (_req, res) => {
  res.json(ingredientService.list());
});

/** PATCH /api/ingredients/:name — set the alcoholic classification. */
ingredientsRouter.patch('/:name', requireAdmin, (req, res) => {
  const { isAlcoholic } = parseOrThrow(classifyIngredientSchema, req.body);
  // Express has already decoded the path parameter; decoding again would throw
  // on a literal '%' and mangle names like '100% agave'.
  const name = parseOrThrow(ingredientNameParamSchema, req.params.name);
  res.json(ingredientService.classify(name, isAlcoholic));
});
