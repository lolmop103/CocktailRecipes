import { useState, useCallback, useEffect } from 'react';
import type { Unit } from '../types/index.js';

const STORAGE_KEY = 'cocktail.unit';

function readStoredUnit(): Unit {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'oz' ? 'oz' : 'ml';
  } catch {
    // Private mode / blocked site data — the default is fine.
    return 'ml';
  }
}

export function useUnit() {
  const [unit, setUnit] = useState<Unit>(readStoredUnit);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, unit);
    } catch {
      // Persisting the preference is a convenience, never a requirement.
    }
  }, [unit]);

  const toggle = useCallback(() => {
    setUnit((u) => (u === 'ml' ? 'oz' : 'ml'));
  }, []);

  return { unit, toggle };
}
