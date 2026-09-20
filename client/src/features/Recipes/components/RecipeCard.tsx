import type { Recipe, Unit, Collection } from '../types/index.js';
import { formatAmount } from '../utils/units.js';
import { CollectionPicker } from './CollectionPicker.js';

interface Props {
  recipe: Recipe;
  unit: Unit;
  collections: Collection[];
  onRate: (id: string, rating: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddToCollection: (collectionId: string, recipeId: string) => void;
  onRemoveFromCollection: (collectionId: string, recipeId: string) => void;
  onCreateCollection: (name: string) => void;
}

const RATINGS = [1, 2, 3, 4, 5] as const;

function StarRating({
  value,
  recipeName,
  onRate,
}: {
  value?: number;
  recipeName: string;
  onRate: (n: number) => void;
}) {
  return (
    <div className="star-rating" role="group" aria-label={`Rating: ${value ?? 'unrated'}`}>
      {RATINGS.map((n) => (
        <button
          key={n}
          type="button"
          className={`star ${n <= (value ?? 0) ? 'star--filled' : 'star--empty'}`}
          aria-label={`Rate ${recipeName} ${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={value === n}
          onClick={() => onRate(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function RecipeCard({
  recipe,
  unit,
  collections,
  onRate,
  onEdit,
  onDelete,
  onAddToCollection,
  onRemoveFromCollection,
  onCreateCollection,
}: Props) {
  function handleDelete() {
    if (window.confirm(`Delete "${recipe.name}"? This cannot be undone.`)) {
      onDelete();
    }
  }

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
        <div className="recipe-card__actions">
          <button
            type="button"
            className="btn-icon"
            aria-label={`Edit ${recipe.name}`}
            onClick={onEdit}
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
        />
        <div className="recipe-card__footer-right">
          <span className="ingredient-count">
            {recipe.ingredients.length} ingredient
            {recipe.ingredients.length !== 1 ? 's' : ''}
          </span>
          <CollectionPicker
            recipeId={recipe.id}
            recipeName={recipe.name}
            collections={collections}
            onAdd={(colId) => onAddToCollection(colId, recipe.id)}
            onRemove={(colId) => onRemoveFromCollection(colId, recipe.id)}
            onCreate={onCreateCollection}
          />
        </div>
      </div>
    </article>
  );
}
