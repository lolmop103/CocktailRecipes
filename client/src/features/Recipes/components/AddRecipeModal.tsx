import { useState, useRef, type FormEvent } from 'react';
import type {
  CreateRecipePayload,
  Recipe,
  RecipeUpdatePayload,
  IngredientMeta,
} from '../types/index.js';
import { ApiError } from '../services/api.js';
import { ClassifyIngredientsModal } from './ClassifyIngredientsModal.js';
import { IngredientNameInput } from './IngredientNameInput.js';
import { useModal } from '../hooks/useModal.js';
import {
  GLASS_TYPES,
  KNOWN_TAGS,
  emptyForm,
  filledRows,
  formFromRecipe,
  toCreatePayload,
  toUpdatePayload,
  unknownIngredientNames,
  validate,
  withField,
  withIngredientAdded,
  withIngredientField,
  withIngredientRemoved,
  withTagToggled,
  type FormState,
} from './recipeForm.js';

interface Props {
  initialRecipe?: Recipe;
  knownIngredients: IngredientMeta[];
  defaultIsMocktail?: boolean;
  onClose: () => void;
  onCreated: (payload: CreateRecipePayload) => Promise<void>;
  onUpdated?: (id: string, payload: RecipeUpdatePayload) => Promise<void>;
  onClassifyIngredients: (results: { name: string; isAlcoholic: boolean }[]) => Promise<void>;
}

export const AddRecipeModal = ({
  initialRecipe,
  knownIngredients,
  defaultIsMocktail = false,
  onClose,
  onCreated,
  onUpdated,
  onClassifyIngredients,
}: Props) => {
  const isEditing = initialRecipe !== undefined;
  const [form, setForm] = useState<FormState>(() =>
    initialRecipe ? formFromRecipe(initialRecipe) : emptyForm(defaultIsMocktail),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingClassification, setPendingClassification] = useState<string[] | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useModal(dialogRef, onClose);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const problem = validate(form);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    try {
      if (isEditing && onUpdated && initialRecipe) {
        await onUpdated(initialRecipe.id, toUpdatePayload(form));
      } else {
        await onCreated(toCreatePayload(form));
      }

      const unknown = unknownIngredientNames(filledRows(form), knownIngredients);

      if (unknown.length > 0) {
        setPendingClassification(unknown);
      } else {
        onClose();
      }
    } catch (err) {
      // The API reports which field it rejected — showing "name: String must
      // contain at least 1 character" beats a generic failure message.
      setError(
        err instanceof ApiError && err.fieldErrors.length > 0
          ? err.fieldErrors.map((f) => `${f.path}: ${f.message}`).join('; ')
          : 'Could not save recipe. Is the server running?',
      );
    } finally {
      setSaving(false);
    }
  };

  if (pendingClassification !== null) {
    return (
      <ClassifyIngredientsModal
        names={pendingClassification}
        onConfirm={async (results) => {
          await onClassifyIngredients(results);
          onClose();
        }}
        onSkip={onClose}
      />
    );
  }

  const allSelectedNames = form.ingredients.map((row) => row.name);

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="add-recipe-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Edit recipe' : 'Add new recipe'}
      >
        <div className="add-recipe-dialog__inner">
          <div className="add-recipe-dialog__header">
            <h2>{isEditing ? 'Edit Recipe' : 'New Recipe'}</h2>
            <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="form-type-toggle" role="group" aria-label="Recipe type">
            <button
              type="button"
              className={`form-type-btn${!form.isMocktail ? ' form-type-btn--active' : ''}`}
              aria-pressed={!form.isMocktail}
              onClick={() => setForm((prev) => withField(prev, 'isMocktail', false))}
            >
              Cocktail
            </button>
            <button
              type="button"
              className={`form-type-btn${form.isMocktail ? ' form-type-btn--active' : ''}`}
              aria-pressed={form.isMocktail}
              onClick={() => setForm((prev) => withField(prev, 'isMocktail', true))}
            >
              Mocktail
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div className="form-field">
              <label htmlFor="recipe-name">Name *</label>
              <input
                id="recipe-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => withField(prev, 'name', e.target.value))}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- a modal dialog is where autofocus belongs
                autoFocus
              />
            </div>

            <fieldset className="form-fieldset">
              <legend>Ingredients *</legend>
              {form.ingredients.map((row, i) => (
                <div key={row.key} className="ingredient-row">
                  <IngredientNameInput
                    value={row.name}
                    index={i}
                    knownIngredients={knownIngredients}
                    allSelectedNames={allSelectedNames}
                    onChange={(val) => setForm((prev) => withIngredientField(prev, i, 'name', val))}
                  />
                  <div className="ingredient-row__amount-group">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={row.amount}
                      aria-label={`Ingredient ${i + 1} amount`}
                      className="ingredient-row__amount"
                      onChange={(e) =>
                        setForm((prev) => withIngredientField(prev, i, 'amount', e.target.value))
                      }
                    />
                    <div
                      className="unit-toggle unit-toggle--sm"
                      role="group"
                      aria-label={`Ingredient ${i + 1} unit`}
                    >
                      <button
                        type="button"
                        className={`unit-toggle__btn${row.unit === 'ml' ? ' unit-toggle__btn--active' : ''}`}
                        aria-pressed={row.unit === 'ml'}
                        onClick={() =>
                          setForm((prev) => withIngredientField(prev, i, 'unit', 'ml'))
                        }
                      >
                        ml
                      </button>
                      <button
                        type="button"
                        className={`unit-toggle__btn${row.unit === 'oz' ? ' unit-toggle__btn--active' : ''}`}
                        aria-pressed={row.unit === 'oz'}
                        onClick={() =>
                          setForm((prev) => withIngredientField(prev, i, 'unit', 'oz'))
                        }
                      >
                        oz
                      </button>
                    </div>
                  </div>
                  {form.ingredients.length > 1 && (
                    <button
                      type="button"
                      className="ingredient-row__remove"
                      aria-label={`Remove ingredient ${i + 1}`}
                      onClick={() => setForm((prev) => withIngredientRemoved(prev, i))}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="btn-add-ingredient"
                onClick={() => setForm(withIngredientAdded)}
              >
                + Add ingredient
              </button>
            </fieldset>

            <div className="form-field">
              <label htmlFor="recipe-glass">Glass type</label>
              <select
                id="recipe-glass"
                value={form.glassType}
                onChange={(e) => setForm((prev) => withField(prev, 'glassType', e.target.value))}
              >
                <option value="">— choose —</option>
                {GLASS_TYPES.map((glass) => (
                  <option key={glass} value={glass}>
                    {glass}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="recipe-instructions">Instructions</label>
              <textarea
                id="recipe-instructions"
                value={form.instructions}
                rows={3}
                onChange={(e) => setForm((prev) => withField(prev, 'instructions', e.target.value))}
              />
            </div>

            <div className="form-field">
              <span className="form-field__label">Tags</span>
              <div className="tag-pills" role="group" aria-label="Tags">
                {KNOWN_TAGS.map((tag) => (
                  <label
                    key={tag}
                    className={`tag-pill${form.tags.includes(tag) ? ' tag-pill--active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={form.tags.includes(tag)}
                      onChange={() => setForm((prev) => withTagToggled(prev, tag))}
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Recipe'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
