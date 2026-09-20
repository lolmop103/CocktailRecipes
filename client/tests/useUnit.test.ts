import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUnit } from '../src/features/Recipes/hooks/useUnit.js';

const STORAGE_KEY = 'cocktail.unit';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useUnit', () => {
  it('defaultsTo_ml_whenNothingStored', () => {
    const { result } = renderHook(() => useUnit());

    expect(result.current.unit).toBe('ml');
  });

  it('restores_storedPreference_onMount', () => {
    window.localStorage.setItem(STORAGE_KEY, 'oz');

    const { result } = renderHook(() => useUnit());

    expect(result.current.unit).toBe('oz');
  });

  it('ignores_unrecognisedStoredValue', () => {
    window.localStorage.setItem(STORAGE_KEY, 'gallons');

    const { result } = renderHook(() => useUnit());

    expect(result.current.unit).toBe('ml');
  });

  it('togglesBetween_mlAndOz', () => {
    const { result } = renderHook(() => useUnit());

    act(() => result.current.toggle());
    expect(result.current.unit).toBe('oz');

    act(() => result.current.toggle());
    expect(result.current.unit).toBe('ml');
  });

  it('persists_choice_acrossRemounts', () => {
    const first = renderHook(() => useUnit());
    act(() => first.result.current.toggle());
    first.unmount();

    const second = renderHook(() => useUnit());

    expect(second.result.current.unit).toBe('oz');
  });

  it('survives_blockedLocalStorage_onRead', () => {
    // Private browsing and blocked site data make this accessor throw.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });

    const { result } = renderHook(() => useUnit());

    expect(result.current.unit).toBe('ml');
  });

  it('survives_blockedLocalStorage_onWrite', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    const { result } = renderHook(() => useUnit());
    act(() => result.current.toggle());

    // Persisting is a convenience; failing to persist must not break the toggle.
    expect(result.current.unit).toBe('oz');
  });
});
