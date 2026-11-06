import { useEffect, useState } from 'react';

const TICK_MS = 1000;

/**
 * Whole seconds left of a cooldown. Starts when `seconds` (or `restartKey`)
 * changes to a value of at least 1; one 1 s interval runs only while seconds
 * remain, and is cleared at 0 and on unmount.
 */
export const useCountdown = (seconds: number | undefined, restartKey?: unknown): number => {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    setRemaining(
      seconds !== undefined && Number.isFinite(seconds) && seconds >= 1 ? Math.ceil(seconds) : 0,
    );
  }, [seconds, restartKey]);

  const running = remaining > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  return remaining;
};
