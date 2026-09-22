import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * A `display: none` control is not focusable, so it must not count as a stop
 * in the trap. `offsetParent` answers this in a browser but is always null
 * without a layout engine (jsdom), hence the computed-style fallback.
 */
function isFocusable(el: HTMLElement): boolean {
  if (el.offsetParent !== null) return true;
  return window.getComputedStyle(el).display !== 'none';
}

/**
 * Modal plumbing: lock background scroll, close on Escape, keep Tab inside the
 * dialog, and hand focus back to whatever opened it.
 *
 * `aria-modal="true"` is only a promise to assistive tech — without a real trap
 * the browser will happily tab into the page behind the dialog.
 */
export function useModal(dialogRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => isFocusable(el) || el === document.activeElement);
      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialogRef, onClose]);
}
