import type { IngredientMeta } from '../types/index.js';

interface Props {
  meta: IngredientMeta;
  onUpdate: (name: string, isAlcoholic: boolean) => Promise<void>;
}

/** One row of the ingredient manager: a name and its alcoholic classification. */
export const AlcoholicToggle = ({ meta, onUpdate }: Props) => (
  <div className="manage-row">
    <span className="manage-row__name">{meta.name}</span>
    <div className="classify-toggle" role="group" aria-label={`${meta.name} classification`}>
      <button
        type="button"
        className={`classify-btn${meta.isAlcoholic === true ? ' classify-btn--active' : ''}`}
        // No request when the value is already what was clicked.
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
