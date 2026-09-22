import { useEffect, useState } from 'react';

/**
 * Trails `value` by `delayMs`, so a burst of keystrokes settles into one update.
 *
 * Used for the search term only: it feeds the query key, so debouncing here
 * collapses a burst of typing into a single request while the input itself
 * stays fully responsive.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(setDebounced, delayMs, value);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
