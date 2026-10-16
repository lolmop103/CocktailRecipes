import { RATINGS } from '../constants.js';

interface Props {
  value?: number;
  /** Named in each button's label so screen readers can tell cards apart. */
  recipeName: string;
  onRate: (rating: number) => void;
  /** Visitors see the rating but cannot change it. */
  readOnly?: boolean;
}

const starClass = (n: number, value: number | undefined) =>
  `star ${n <= (value ?? 0) ? 'star--filled' : 'star--empty'}`;

export const StarRating = ({ value, recipeName, onRate, readOnly = false }: Props) => (
  <div className="star-rating" role="group" aria-label={`Rating: ${value ?? 'unrated'}`}>
    {RATINGS.map((n) =>
      readOnly ? (
        <span key={n} className={starClass(n, value)} aria-hidden="true">
          ★
        </span>
      ) : (
        <button
          key={n}
          type="button"
          className={starClass(n, value)}
          aria-label={`Rate ${recipeName} ${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={value === n}
          onClick={() => onRate(n)}
        >
          ★
        </button>
      ),
    )}
  </div>
);
