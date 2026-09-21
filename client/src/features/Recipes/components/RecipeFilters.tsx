import { useState } from 'react';
import type {
  RecipeFilters as RecipeFiltersState,
  IngredientMeta,
  Collection,
} from '../types/index.js';
import { IngredientSelector } from './IngredientSelector.js';
import { ManageIngredientsPanel } from './ManageIngredientsPanel.js';
import { StarRatingFilter } from './StarRatingFilter.js';

interface Props {
  filters: RecipeFiltersState;
  knownIngredients: IngredientMeta[];
  collections: Collection[];
  hideAlcoholicIngredients?: boolean;
  onChange: <K extends keyof RecipeFiltersState>(key: K, value: RecipeFiltersState[K]) => void;
  onReset: () => void;
  onUpdateIngredientMeta: (name: string, isAlcoholic: boolean) => Promise<void>;
}

export const RecipeFilters = ({
  filters,
  knownIngredients,
  collections,
  hideAlcoholicIngredients = false,
  onChange,
  onReset,
  onUpdateIngredientMeta,
}: Props) => {
  const [showManage, setShowManage] = useState(false);
  return (
    <aside className="recipe-filters">
      <div className="filters-header">
        <h2>Filters</h2>
        <button type="button" className="btn-reset" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="filter-group">
        <label htmlFor="search" className="filter-label">
          Search by name
        </label>
        <input
          id="search"
          type="search"
          value={filters.search}
          placeholder="e.g. Mojito…"
          onChange={(e) => onChange('search', e.target.value)}
        />
      </div>

      <div className="filter-section-header">
        <IngredientSelector
          label="Ingredients"
          knownIngredients={knownIngredients}
          selected={filters.ingredients}
          unavailable={filters.excludeIngredients}
          hideAlcoholic={hideAlcoholicIngredients}
          onChange={(v) => onChange('ingredients', v)}
        />
        <button
          type="button"
          className="btn-manage-ing"
          aria-label="Manage ingredient classifications"
          title="Manage ingredients"
          onClick={() => setShowManage((v) => !v)}
        >
          ⚙
        </button>
      </div>

      {showManage && (
        <ManageIngredientsPanel
          knownIngredients={knownIngredients}
          onUpdate={onUpdateIngredientMeta}
          onClose={() => setShowManage(false)}
        />
      )}

      {filters.ingredients.length > 0 && (
        <div className="filter-group filter-group--checkbox">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={filters.onlySelectedIngredients}
              onChange={(e) => onChange('onlySelectedIngredients', e.target.checked)}
            />
            <span>Only these ingredients</span>
          </label>
        </div>
      )}

      <IngredientSelector
        label="Without"
        knownIngredients={knownIngredients}
        selected={filters.excludeIngredients}
        unavailable={filters.ingredients}
        hideAlcoholic={hideAlcoholicIngredients}
        onChange={(v) => onChange('excludeIngredients', v)}
      />

      <StarRatingFilter value={filters.minRating} onChange={(v) => onChange('minRating', v)} />

      {collections.length > 0 && (
        <div className="filter-group">
          <label htmlFor="collection-filter" className="filter-label">
            Collection
          </label>
          <select
            id="collection-filter"
            value={filters.collectionId ?? ''}
            onChange={(e) => onChange('collectionId', e.target.value || undefined)}
          >
            <option value="">— all —</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </aside>
  );
};
