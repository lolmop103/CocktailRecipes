import { Router } from 'express';
import { healthRouter } from './health.js';
import { recipesRouter } from './recipes.js';
import { ingredientsRouter } from './ingredients.js';
import { collectionsRouter } from './collections.js';

export const router = Router();

router.use('/health', healthRouter);
router.use('/recipes', recipesRouter);
router.use('/ingredients', ingredientsRouter);
router.use('/collections', collectionsRouter);
