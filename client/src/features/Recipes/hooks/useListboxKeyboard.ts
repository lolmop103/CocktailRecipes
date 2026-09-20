import { useCallback, useEffect, useState } from 'react';

interface Options {
  itemCount: number;
  isOpen: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
}

/**
 * Keyboard behaviour for the combobox/listbox pattern: Arrow keys move the
 * active option, Enter picks it, Escape closes. Without this a dropdown is
 * mouse-only and unusable from the keyboard.
 */
export function useListboxKeyboard({ itemCount, isOpen, onSelect, onClose }: Options) {
  const [activeIndex, setActiveIndex] = useState(-1);

  // Keep the highlight in range as the filtered list shrinks or the list closes.
  useEffect(() => {
    setActiveIndex((current) => (current >= itemCount ? itemCount - 1 : current));
  }, [itemCount]);

  useEffect(() => {
    if (!isOpen) setActiveIndex(-1);
  }, [isOpen]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (itemCount > 0) setActiveIndex((i) => (i + 1) % itemCount);
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (itemCount > 0) setActiveIndex((i) => (i <= 0 ? itemCount - 1 : i - 1));
          break;
        case 'Home':
          if (itemCount > 0) {
            event.preventDefault();
            setActiveIndex(0);
          }
          break;
        case 'End':
          if (itemCount > 0) {
            event.preventDefault();
            setActiveIndex(itemCount - 1);
          }
          break;
        case 'Enter':
          if (isOpen && activeIndex >= 0 && activeIndex < itemCount) {
            event.preventDefault();
            onSelect(activeIndex);
          }
          break;
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [activeIndex, isOpen, itemCount, onClose, onSelect],
  );

  return { activeIndex, setActiveIndex, onKeyDown };
}
