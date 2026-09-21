import { useState, useRef, useCallback, useEffect } from 'react';
import type { Collection } from '../types/index.js';
import { useDismissable } from '../hooks/useDismissable.js';

interface Props {
  recipeId: string;
  recipeName: string;
  collections: Collection[];
  onAdd: (collectionId: string) => void;
  onRemove: (collectionId: string) => void;
  onCreate: (name: string) => void;
}

export const CollectionPicker = ({
  recipeId,
  recipeName,
  collections,
  onAdd,
  onRemove,
  onCreate,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  useDismissable(containerRef, isOpen, close);

  // Escape closes the popover wherever focus happens to be inside it.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewName('');
  };

  return (
    <div ref={containerRef} className="collection-picker">
      <button
        type="button"
        className={`collection-picker__trigger${isOpen ? ' collection-picker__trigger--open' : ''}`}
        aria-label={`Add ${recipeName} to a collection`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        🔖
      </button>

      {isOpen && (
        <div className="collection-picker__popover" role="dialog" aria-label="Collections">
          {collections.length === 0 && (
            <p className="collection-picker__empty">No collections yet.</p>
          )}
          <ul className="collection-picker__list">
            {collections.map((col) => {
              const inCollection = col.recipeIds.includes(recipeId);
              return (
                <li key={col.id}>
                  <label className="collection-picker__item">
                    <input
                      type="checkbox"
                      checked={inCollection}
                      onChange={() => (inCollection ? onRemove(col.id) : onAdd(col.id))}
                    />
                    <span>{col.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="collection-picker__new">
            <input
              type="text"
              value={newName}
              placeholder="New collection…"
              aria-label="New collection name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            <button
              type="button"
              className="btn-primary"
              aria-label="Create collection"
              onClick={handleCreate}
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
