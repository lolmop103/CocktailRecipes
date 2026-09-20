import type { Collection } from '@cocktail/shared';
import { collectionStore } from '../data/collectionStore.js';
import { recipeStore } from '../data/recipeStore.js';
import { NotFoundError } from '../lib/errors.js';

export const collectionService = {
  list(): Collection[] {
    return collectionStore.getAll();
  },

  create(name: string): Collection {
    return collectionStore.create(name);
  },

  addRecipe(collectionId: string, recipeId: string): Collection {
    // Checked before the insert so a bad id reads as 404 rather than surfacing
    // as a foreign-key violation from the driver.
    if (!recipeStore.exists(recipeId)) throw new NotFoundError('Recipe', recipeId);

    const updated = collectionStore.addRecipe(collectionId, recipeId);
    if (!updated) throw new NotFoundError('Collection', collectionId);
    return updated;
  },

  removeRecipe(collectionId: string, recipeId: string): Collection {
    const updated = collectionStore.removeRecipe(collectionId, recipeId);
    if (!updated) throw new NotFoundError('Collection', collectionId);
    return updated;
  },

  remove(id: string): void {
    if (!collectionStore.deleteCollection(id)) throw new NotFoundError('Collection', id);
  },
};
