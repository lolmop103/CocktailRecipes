import { useState, useRef } from 'react';
import { useModal } from '../hooks/useModal.js';
import { toClassifyResults, undecidedNames, type ClassifyResult } from './classifyForm.js';

interface Props {
  names: string[];
  onConfirm: (results: ClassifyResult[]) => void;
  onSkip: () => void;
}

export const ClassifyIngredientsModal = ({ names, onConfirm, onSkip }: Props) => {
  // No default: guessing "alcoholic" for every new ingredient silently
  // corrupts mocktail filtering whenever the guess is wrong.
  const [choices, setChoices] = useState<Record<string, boolean | undefined>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  useModal(dialogRef, onSkip);

  const undecided = undecidedNames(names, choices);

  const choose = (name: string, isAlcoholic: boolean) => {
    setChoices((prev) => ({ ...prev, [name]: isAlcoholic }));
  };

  const handleConfirm = () => {
    if (undecided.length > 0) return;
    onConfirm(toClassifyResults(names, choices));
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="classify-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Classify new ingredients"
      >
        <div className="classify-modal__header">
          <h2>New ingredients — classify</h2>
          <p className="classify-modal__sub">
            Are these alcoholic? This is what mocktail filtering relies on.
          </p>
        </div>

        <ul className="classify-list">
          {names.map((name) => (
            <li key={name} className="classify-row">
              <span className="classify-row__name">{name}</span>
              <div className="classify-toggle" role="group" aria-label={`${name} type`}>
                <button
                  type="button"
                  className={`classify-btn${choices[name] === true ? ' classify-btn--active' : ''}`}
                  aria-pressed={choices[name] === true}
                  onClick={() => choose(name, true)}
                >
                  Alcoholic
                </button>
                <button
                  type="button"
                  className={`classify-btn${choices[name] === false ? ' classify-btn--active' : ''}`}
                  aria-pressed={choices[name] === false}
                  onClick={() => choose(name, false)}
                >
                  Non-alcoholic
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="classify-modal__actions">
          <button type="button" className="btn-secondary" onClick={onSkip}>
            Skip for now
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={undecided.length > 0}
            onClick={handleConfirm}
          >
            {undecided.length > 0 ? `${undecided.length} left to classify` : 'Save classifications'}
          </button>
        </div>
      </div>
    </div>
  );
};
