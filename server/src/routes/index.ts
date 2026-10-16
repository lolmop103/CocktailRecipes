import { Router } from 'express';
import { healthRouter } from './health.js';
import { recipesRouter } from './recipes.js';
import { ingredientsRouter } from './ingredients.js';
import { collectionsRouter } from './collections.js';
import { authRouter } from './auth.js';
import { session } from '../middleware/session.js';
import { sameOrigin } from '../middleware/sameOrigin.js';
import { env } from '../config/env.js';

export const router = Router();

// Every API request learns whether it comes from the admin before any route runs.
router.use(session);
// Nothing that changes data — login and logout included — is accepted cross-site.
router.use(sameOrigin(env.CLIENT_ORIGIN));

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/recipes', recipesRouter);
router.use('/ingredients', ingredientsRouter);
router.use('/collections', collectionsRouter);
