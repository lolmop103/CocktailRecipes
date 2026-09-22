import { useEffect, type RefObject } from 'react';

/**
 * Closes a popover when the pointer goes down outside it or focus leaves it.
 * Pointer-only dismissal strands keyboard users inside an open dropdown.
 */
export function useDismissable(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;

    function isOutside(target: EventTarget | null): boolean {
      return !!ref.current && !ref.current.contains(target as Node);
    }

    function handlePointerDown(event: MouseEvent) {
      if (isOutside(event.target)) onDismiss();
    }

    function handleFocusIn(event: FocusEvent) {
      if (isOutside(event.target)) onDismiss();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [ref, isOpen, onDismiss]);
}
