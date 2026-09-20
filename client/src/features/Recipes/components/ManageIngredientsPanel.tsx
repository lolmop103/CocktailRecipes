import type { IngredientMeta } from '../types/index.js';

interface Props {
  knownIngredients: IngredientMeta[];
  onUpdate: (name: string, isAlcoholic: boolean) => Promise<void>;
  onClose: () => void;
}

function AlcoholicToggle({
  meta,
  onUpdate,
}: {
  meta: IngredientMeta;
  onUpdate: Props['onUpdate'];
}) {
  return (
    <div className="manage-row">
      <span className="manage-row__name">{meta.name}</span>
      <div className="classify-toggle" role="group" aria-label={`${meta.name} classification`}>
        <button
          type="button"
          className={`classify-btn${meta.isAlcoholic === true ? ' classify-btn--active' : ''}`}
          onClick={() => meta.isAlcoholic !== true && void onUpdate(meta.name, true)}
        >
          Alcoholic
        </button>
        <button
          type="button"
          className={`classify-btn${meta.isAlcoholic === false ? ' classify-btn--active' : ''}`}
          onClick={() => meta.isAlcoholic !== false && void onUpdate(meta.name, false)}
        >
          Non-alcoholic
        </button>
      </div>
      {meta.isAlcoholic === null && (
        <span className="manage-row__unset" aria-label="Not yet classified">
          ?
        </span>
      )}
    </div>
  );
}

export function ManageIngredientsPanel({ knownIngredients, onUpdate, onClose }: Props) {
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
}
