import { z } from 'zod';

export const collectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  recipeIds: z.array(z.string()),
});

export const createCollectionSchema = z.object({
  name: z.string().min(1),
});

export type Collection = z.infer<typeof collectionSchema>;
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
