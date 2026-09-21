import type { IngredientMeta } from '../types/index.js';
import { AlcoholicToggle } from './AlcoholicToggle.js';

interface Props {
  knownIngredients: IngredientMeta[];
  onUpdate: (name: string, isAlcoholic: boolean) => Promise<void>;
  onClose: () => void;
}

export const ManageIngredientsPanel = ({ knownIngredients, onUpdate, onClose }: Props) => {
  return (
    <div className="manage-ingredients-panel">
      <div className="manage-panel__header">
        <span className="filter-label">Manage ingredients</span>
        <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <ul className="manage-list">
        {knownIngredients.map((m) => (
          <li key={m.name}>
            <AlcoholicToggle meta={m} onUpdate={onUpdate} />
          </li>
        ))}
      </ul>
    </div>
  );
};
