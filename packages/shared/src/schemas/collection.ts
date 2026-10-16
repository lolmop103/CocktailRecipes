import { z } from 'zod';
import { COLLECTION_NAME_MAX } from '../limits.js';

export const collectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  recipeIds: z.array(z.string()),
});

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(COLLECTION_NAME_MAX),
});

export type Collection = z.infer<typeof collectionSchema>;
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
