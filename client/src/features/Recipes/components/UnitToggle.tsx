import type { Unit } from '../types/index.js';

interface Props {
  unit: Unit;
  onToggle: () => void;
}

export const UnitToggle = ({ unit, onToggle }: Props) => {
  return (
    <div className="unit-toggle" role="group" aria-label="Amount unit">
      <button
        type="button"
        className={`unit-toggle__btn${unit === 'ml' ? ' unit-toggle__btn--active' : ''}`}
        onClick={() => unit !== 'ml' && onToggle()}
        aria-pressed={unit === 'ml'}
      >
        ml
      </button>
      <button
        type="button"
        className={`unit-toggle__btn${unit === 'oz' ? ' unit-toggle__btn--active' : ''}`}
        onClick={() => unit !== 'oz' && onToggle()}
        aria-pressed={unit === 'oz'}
      >
        oz
      </button>
    </div>
  );
};
