import { useRef } from 'react';

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

export function RecipeTabs({ activeTab, panelId, onChange }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Arrow-key navigation is part of the tablist contract, not a nicety. */
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    const next = (index + delta + TABS.length) % TABS.length;
    const tab = TABS[next];
    if (tab) {
      onChange(tab.id);
      refs.current[next]?.focus();
    }
  }

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
}
