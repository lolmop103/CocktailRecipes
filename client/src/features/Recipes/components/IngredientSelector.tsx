import { useState, useRef, useCallback, useId } from 'react';
import type { IngredientMeta } from '../types/index.js';
import { useListboxKeyboard } from '../hooks/useListboxKeyboard.js';
import { useDismissable } from '../hooks/useDismissable.js';

interface Props {
  label: string;
  knownIngredients: IngredientMeta[];
  selected: string[];
  hideAlcoholic?: boolean;
  /** Names to keep out of the dropdown — typically the other picker's choices. */
  unavailable?: string[];
  onChange: (values: string[]) => void;
}

export const IngredientSelector = ({
  label,
  knownIngredients,
  selected,
  hideAlcoholic = false,
  unavailable = [],
  onChange,
}: Props) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  useDismissable(containerRef, isOpen, close);

  const normalizedSelected = selected.map((s) => s.toLowerCase());
  // Requiring and excluding the same ingredient can only ever return nothing,
  // so each picker hides what the other has already claimed.
  const normalizedUnavailable = unavailable.map((s) => s.toLowerCase());
  const filtered = knownIngredients
    .filter((m) => !hideAlcoholic || m.isAlcoholic !== true)
    .filter(
      (m) =>
        !normalizedSelected.includes(m.name.toLowerCase()) &&
        !normalizedUnavailable.includes(m.name.toLowerCase()) &&
        m.name.toLowerCase().includes(search.toLowerCase()),
    )
    .map((m) => m.name);

  const add = useCallback(
    (index: number) => {
      const ingredient = filtered[index];
      if (ingredient === undefined) return;
      onChange([...selected, ingredient]);
      setSearch('');
      // Dropdown stays open so several can be added in a row.
    },
    [filtered, onChange, selected],
  );

  const { activeIndex, setActiveIndex, onKeyDown } = useListboxKeyboard({
    itemCount: filtered.length,
    isOpen,
    onSelect: add,
    onClose: close,
  });

  const remove = (index: number) => {
    onChange(selected.filter((_, i) => i !== index));
  };

  return (
    <div className="filter-group">
      <span className="filter-label" id={`${listboxId}-label`}>
        {label}
      </span>

      {selected.length > 0 && (
        <ul className="ingredient-chips" aria-label={`Selected ${label.toLowerCase()}`}>
          {selected.map((value, i) => (
            <li key={value} className="chip">
              <span className="chip__name">{value}</span>
              <button
                type="button"
                className="chip__remove"
                aria-label={`Remove ${value}`}
                onClick={() => remove(i)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={containerRef} className="ingredient-combobox">
        <input
          type="text"
          className="ingredient-combobox__input"
          value={search}
          placeholder={knownIngredients.length === 0 ? 'Loading…' : 'Search ingredient…'}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          aria-label={`Search ${label.toLowerCase()}`}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          {...(isOpen && activeIndex >= 0
            ? { 'aria-activedescendant': optionId(activeIndex) }
            : {})}
        />

        {isOpen && filtered.length > 0 && (
          <ul id={listboxId} className="ingredient-dropdown" role="listbox" aria-label={label}>
            {filtered.map((ingredient, index) => (
              <li
                key={ingredient}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'is-active' : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  add(index);
                }}
              >
                {ingredient}
              </li>
            ))}
          </ul>
        )}

        {isOpen && search.length > 0 && filtered.length === 0 && (
          <div className="ingredient-dropdown ingredient-dropdown--empty" role="status">
            No matching ingredients
          </div>
        )}
      </div>
    </div>
  );
};
