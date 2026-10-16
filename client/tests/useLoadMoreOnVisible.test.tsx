import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { useLoadMoreOnVisible } from '../src/features/Recipes/hooks/useLoadMoreOnVisible.js';
import { installIntersectionObserverStub, type ObserverStub } from './intersectionObserverStub.js';

interface Props {
  enabled: boolean;
  onVisible: () => void;
}

const Harness = ({ enabled, onVisible }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  useLoadMoreOnVisible(ref, enabled, onVisible);
  return <div ref={ref} />;
};

let observers: ObserverStub;

beforeEach(() => {
  observers = installIntersectionObserverStub();
});

describe('useLoadMoreOnVisible', () => {
  it('useLoadMoreOnVisible_sentinelIntersects_callsOnVisibleOnce', () => {
    const onVisible = vi.fn();
    render(<Harness enabled onVisible={onVisible} />);

    observers.fire(true);

    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('useLoadMoreOnVisible_notIntersecting_doesNotCall', () => {
    const onVisible = vi.fn();
    render(<Harness enabled onVisible={onVisible} />);

    observers.fire(false);

    expect(onVisible).not.toHaveBeenCalled();
  });

  it('useLoadMoreOnVisible_disabled_doesNotObserve', () => {
    const onVisible = vi.fn();
    render(<Harness enabled={false} onVisible={onVisible} />);

    observers.fire(true);

    expect(onVisible).not.toHaveBeenCalled();
  });

  it('useLoadMoreOnVisible_usesA600pxRootMargin', () => {
    render(<Harness enabled onVisible={vi.fn()} />);

    expect(observers.instances[0]?.options?.rootMargin).toBe('600px');
  });

  it('useLoadMoreOnVisible_unmount_disconnects', () => {
    const { unmount } = render(<Harness enabled onVisible={vi.fn()} />);

    unmount();

    expect(observers.instances[0]?.disconnected).toBe(true);
  });
});
