import { RATINGS } from '../constants.js';

interface Props {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

export const StarRatingFilter = ({ value, onChange }: Props) => (
  <div className="filter-group">
    <span className="filter-label">Minimum rating</span>
    <div className="star-filter" role="group" aria-label="Minimum star rating">
      {RATINGS.map((n) => (
        <button
          key={n}
          type="button"
          className={`star-filter__star${n <= (value ?? 0) ? ' star-filter__star--active' : ''}`}
          aria-label={`${n} star minimum`}
          aria-pressed={value === n}
          // Clicking the active value clears the filter rather than re-applying it.
          onClick={() => onChange(value === n ? undefined : n)}
        >
          ★
        </button>
      ))}
      {value !== undefined && (
        <button
          type="button"
          className="star-filter__clear"
          aria-label="Clear rating filter"
          onClick={() => onChange(undefined)}
        >
          ✕
        </button>
      )}
    </div>
  </div>
);
