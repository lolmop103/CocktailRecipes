import { memo } from 'react';
import type { Recipe, Unit, Collection } from '../types/index.js';
import { formatAmount } from '../utils/units.js';
import { CollectionPicker } from './CollectionPicker.js';
import { StarRating } from './StarRating.js';

interface Props {
  recipe: Recipe;
  /** The admin sees edit, delete, rating and collection controls; visitors only read. */
  canEdit: boolean;
  unit: Unit;
  collections: Collection[];
  onRate: (id: string, rating: number) => void;
  onEdit: (recipe: Recipe) => void;
  onDelete: (id: string) => void;
  onAddToCollection: (collectionId: string, recipeId: string) => void;
  onRemoveFromCollection: (collectionId: string, recipeId: string) => void;
  onCreateCollection: (name: string) => void;
}

/**
 * Memoised: when the next page is appended, the cards already on screen keep
 * their props (stable callbacks, same recipe objects) and do not re-render.
 */
export const RecipeCard = memo(
  ({
    recipe,
    canEdit,
    unit,
    collections,
    onRate,
    onEdit,
    onDelete,
    onAddToCollection,
    onRemoveFromCollection,
    onCreateCollection,
  }: Props) => {
    const handleDelete = () => {
      if (window.confirm(`Delete "${recipe.name}"? This cannot be undone.`)) {
        onDelete(recipe.id);
      }
    };

    return (
      <article className="recipe-card">
        <div className="recipe-card__header">
          <div className="recipe-card__header-main">
            <h3 className="recipe-card__name">{recipe.name}</h3>
            <div className="recipe-card__meta">
              {recipe.glassType && <span className="badge badge--glass">{recipe.glassType}</span>}
              {recipe.tags?.map((tag) => (
                <span key={tag} className="badge badge--tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {canEdit && (
            <div className="recipe-card__actions">
              <button
                type="button"
                className="btn-icon"
                aria-label={`Edit ${recipe.name}`}
                onClick={() => onEdit(recipe)}
              >
                ✏
              </button>
              <button
                type="button"
                className="btn-icon btn-icon--danger"
                aria-label={`Delete ${recipe.name}`}
                onClick={handleDelete}
              >
                🗑
              </button>
            </div>
          )}
        </div>

        <ul className="recipe-card__ingredients">
          {recipe.ingredients.map((ing, index) => {
            const formatted = formatAmount(ing.amount, unit);
            return (
              // Ingredient names are not unique within a recipe (a split pour, a
              // garnish of the same thing), so position is the only stable key.
              <li key={`${index}-${ing.name}`}>
                {formatted && <span className="ingredient-amount">{formatted}</span>}
                <span className="ingredient-name">{ing.name}</span>
              </li>
            );
          })}
        </ul>

        {recipe.instructions && <p className="recipe-card__instructions">{recipe.instructions}</p>}

        <div className="recipe-card__footer">
          <StarRating
            {...(recipe.rating !== undefined ? { value: recipe.rating } : {})}
            recipeName={recipe.name}
            onRate={(n) => onRate(recipe.id, n)}
            readOnly={!canEdit}
          />
          <div className="recipe-card__footer-right">
            <span className="ingredient-count">
              {recipe.ingredients.length} ingredient
              {recipe.ingredients.length !== 1 ? 's' : ''}
            </span>
            {canEdit && (
              <CollectionPicker
                recipeId={recipe.id}
                recipeName={recipe.name}
                collections={collections}
                onAdd={(colId) => onAddToCollection(colId, recipe.id)}
                onRemove={(colId) => onRemoveFromCollection(colId, recipe.id)}
                onCreate={onCreateCollection}
              />
            )}
          </div>
        </div>
      </article>
    );
  },
);
