import { RATINGS } from '../constants.js';

interface Props {
  value?: number;
  /** Named in each button's label so screen readers can tell cards apart. */
  recipeName: string;
  onRate: (rating: number) => void;
}

export const StarRating = ({ value, recipeName, onRate }: Props) => (
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
