import { useRef } from 'react';
import { nextIndexForArrowKey } from '../utils/keyboard.js';

export type RecipeTab = 'cocktail' | 'mocktail';

interface Props {
  activeTab: RecipeTab;
  panelId: string;
  onChange: (tab: RecipeTab) => void;
}

const TABS: { id: RecipeTab; label: string }[] = [
  { id: 'cocktail', label: '🍹 Cocktails' },
  { id: 'mocktail', label: '🥤 Mocktails' },
];

export const RecipeTabs = ({ activeTab, panelId, onChange }: Props) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Arrow-key navigation is part of the tablist contract, not a nicety. */
  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = nextIndexForArrowKey(event.key, index, TABS.length);
    if (next === null) return;

    event.preventDefault();
    const tab = TABS[next];
    if (tab) {
      onChange(tab.id);
      refs.current[next]?.focus();
    }
  };

  return (
    <div className="recipe-tabs" role="tablist" aria-label="Recipe type">
      {TABS.map((tab, index) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={panelId}
            // Roving tabindex: the tablist is a single tab stop.
            tabIndex={isActive ? 0 : -1}
            className={`recipe-tab${isActive ? ' recipe-tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
