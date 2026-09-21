import { useState, useRef, useCallback, useId } from 'react';
import type { IngredientMeta } from '../types/index.js';
import { useListboxKeyboard } from '../hooks/useListboxKeyboard.js';
import { useDismissable } from '../hooks/useDismissable.js';

const MAX_SUGGESTIONS = 8;

interface Props {
  value: string;
  index: number;
  knownIngredients: IngredientMeta[];
  allSelectedNames: string[];
  onChange: (value: string) => void;
}

/** Inline autocomplete for a single ingredient name in the recipe form. */
export const IngredientNameInput = ({
  value,
  index,
  knownIngredients,
  allSelectedNames,
  onChange,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-option-${i}`;

  const close = useCallback(() => setIsOpen(false), []);
  useDismissable(containerRef, isOpen, close);

  const otherNames = allSelectedNames
    .filter((_, i) => i !== index)
    .map((name) => name.toLowerCase());

  const suggestions = knownIngredients
    .map((m) => m.name)
    .filter(
      (name) =>
        !otherNames.includes(name.toLowerCase()) &&
        name.toLowerCase().includes(value.toLowerCase()) &&
        name.toLowerCase() !== value.toLowerCase(),
    )
    .slice(0, MAX_SUGGESTIONS);

  const select = useCallback(
    (i: number) => {
      const name = suggestions[i];
      if (name === undefined) return;
      onChange(name);
      setIsOpen(false);
    },
    [onChange, suggestions],
  );

  const { activeIndex, setActiveIndex, onKeyDown } = useListboxKeyboard({
    itemCount: suggestions.length,
    isOpen,
    onSelect: select,
    onClose: close,
  });

  return (
    <div ref={containerRef} className="ingredient-name-combobox">
      <input
        type="text"
        value={value}
        aria-label={`Ingredient ${index + 1} name`}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        {...(isOpen && activeIndex >= 0 ? { 'aria-activedescendant': optionId(activeIndex) } : {})}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={onKeyDown}
      />

      {isOpen && suggestions.length > 0 && (
        <ul
          id={listboxId}
          className="ingredient-dropdown ingredient-dropdown--modal"
          role="listbox"
          aria-label={`Ingredient ${index + 1} suggestions`}
        >
          {suggestions.map((name, i) => (
            <li
              key={name}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'is-active' : undefined}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                select(i);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
