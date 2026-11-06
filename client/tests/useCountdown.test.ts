import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from '../src/features/Auth/hooks/useCountdown.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it('useCountdown_threeSeconds_countsDownToZeroAndStopsTheTimer', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdown(3));
    expect(result.current).toBe(3);
    expect(vi.getTimerCount()).toBe(1);

    for (const expected of [2, 1, 0]) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current).toBe(expected);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useCountdown_unmountMidway_clearsTheTimer', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useCountdown(10));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, 0, -3, Number.NaN])('useCountdown_%s_noTimerAndZero', (value) => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdown(value));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useCountdown_newValue_restarts', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ s }) => useCountdown(s), {
      initialProps: { s: undefined as number | undefined },
    });
    expect(result.current).toBe(0);
    rerender({ s: 5 });
    expect(result.current).toBe(5);
  });
});
