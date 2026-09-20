import type { RecipeFilters, SortBy, Unit } from '../types/index.js';
import { UnitToggle } from './UnitToggle.js';

interface Props {
  filters: Pick<RecipeFilters, 'sortBy' | 'sortOrder'>;
  totalCount: number;
  unit: Unit;
  onToggleUnit: () => void;
  onChange: <K extends keyof RecipeFilters>(key: K, value: RecipeFilters[K]) => void;
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'rating', label: 'Rating' },
  { value: 'ingredientCount', label: 'Ingredient count' },
];

export function RecipeSortBar({ filters, totalCount, unit, onToggleUnit, onChange }: Props) {
  function toggleOrder() {
    onChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc');
  }

  return (
    <div className="sort-bar">
      <span className="result-count">
        {totalCount} {totalCount === 1 ? 'recipe' : 'recipes'}
      </span>
      <div className="sort-controls">
        <label htmlFor="sortBy">Sort by</label>
        <select
          id="sortBy"
          value={filters.sortBy}
          onChange={(e) => onChange('sortBy', e.target.value as SortBy)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-order"
          aria-label={`Sort ${filters.sortOrder === 'asc' ? 'ascending' : 'descending'}`}
          onClick={toggleOrder}
        >
          {filters.sortOrder === 'asc' ? '↑' : '↓'}
        </button>
        <UnitToggle unit={unit} onToggle={onToggleUnit} />
      </div>
    </div>
  );
}
