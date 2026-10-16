import { useEffect, useRef, type RefObject } from 'react';

/** Start loading well before the end of the list comes into view. */
const ROOT_MARGIN = '600px';

/**
 * Calls `onVisible` when `target` comes within reach of the viewport. One
 * observer, no scroll listeners; it is torn down while `enabled` is false — a
 * page is loading, the last load failed, or there is nothing more — so a
 * visible sentinel cannot fire a burst of requests.
 */
export function useLoadMoreOnVisible(
  target: RefObject<Element | null>,
  enabled: boolean,
  onVisible: () => void,
): void {
  const callback = useRef(onVisible);

  useEffect(() => {
    callback.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    const element = target.current;
    if (!enabled || element === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, enabled]);
}
