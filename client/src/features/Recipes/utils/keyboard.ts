/**
 * Index a roving-tabindex group should move to for an arrow key, wrapping at
 * both ends. Returns null when the key is not a horizontal arrow, so callers
 * can leave the event alone.
 */
export function nextIndexForArrowKey(key: string, current: number, count: number): number | null {
  const delta = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  if (delta === 0 || count === 0) return null;
  return (current + delta + count) % count;
}
