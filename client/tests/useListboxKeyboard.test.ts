import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { useListboxKeyboard } from '../src/features/Recipes/hooks/useListboxKeyboard.js';

function key(name: string) {
  return { key: name, preventDefault: vi.fn() } as unknown as KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

function setup(overrides: Partial<Parameters<typeof useListboxKeyboard>[0]> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const hook = renderHook(
    (props: Parameters<typeof useListboxKeyboard>[0]) => useListboxKeyboard(props),
    { initialProps: { itemCount: 3, isOpen: true, onSelect, onClose, ...overrides } },
  );
  return { ...hook, onSelect, onClose };
}

describe('useListboxKeyboard', () => {
  it('startsWithNothingHighlighted', () => {
    const { result } = setup();

    expect(result.current.activeIndex).toBe(-1);
  });

  it('arrowDown_wrapsFromLastToFirst', () => {
    const { result } = setup();

    act(() => result.current.onKeyDown(key('ArrowDown')));
    act(() => result.current.onKeyDown(key('ArrowDown')));
    act(() => result.current.onKeyDown(key('ArrowDown')));
    expect(result.current.activeIndex).toBe(2);

    act(() => result.current.onKeyDown(key('ArrowDown')));
    expect(result.current.activeIndex).toBe(0);
  });

  it('arrowUp_fromNothing_goesToTheLastItem', () => {
    const { result } = setup();

    act(() => result.current.onKeyDown(key('ArrowUp')));
    expect(result.current.activeIndex).toBe(2);

    act(() => result.current.onKeyDown(key('ArrowUp')));
    expect(result.current.activeIndex).toBe(1);
  });

  it('homeAndEnd_jumpToTheEdges', () => {
    const { result } = setup();

    act(() => result.current.onKeyDown(key('End')));
    expect(result.current.activeIndex).toBe(2);

    act(() => result.current.onKeyDown(key('Home')));
    expect(result.current.activeIndex).toBe(0);
  });

  it('arrowsAndHomeEnd_doNothing_forAnEmptyList', () => {
    const { result } = setup({ itemCount: 0 });

    for (const name of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      act(() => result.current.onKeyDown(key(name)));
    }

    expect(result.current.activeIndex).toBe(-1);
  });

  it('enter_selectsTheHighlightedItem', () => {
    const { result, onSelect } = setup();

    act(() => result.current.onKeyDown(key('ArrowDown')));
    const enter = key('Enter');
    act(() => result.current.onKeyDown(enter));

    expect(onSelect).toHaveBeenCalledWith(0);
    expect(enter.preventDefault).toHaveBeenCalled();
  });

  it('enter_doesNothing_withoutAHighlight', () => {
    const { result, onSelect } = setup();

    const enter = key('Enter');
    act(() => result.current.onKeyDown(enter));

    expect(onSelect).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it('escape_closes', () => {
    const { result, onClose } = setup();

    act(() => result.current.onKeyDown(key('Escape')));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignoresUnrelatedKeys', () => {
    const { result, onSelect, onClose } = setup();

    const tab = key('Tab');
    act(() => result.current.onKeyDown(tab));

    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clampsTheHighlight_whenTheListShrinks', () => {
    const { result, rerender, onSelect, onClose } = setup();

    act(() => result.current.onKeyDown(key('End')));
    expect(result.current.activeIndex).toBe(2);

    rerender({ itemCount: 1, isOpen: true, onSelect, onClose });

    expect(result.current.activeIndex).toBe(0);
  });

  it('clearsTheHighlight_whenClosed', () => {
    const { result, rerender, onSelect, onClose } = setup();

    act(() => result.current.onKeyDown(key('ArrowDown')));
    rerender({ itemCount: 3, isOpen: false, onSelect, onClose });

    expect(result.current.activeIndex).toBe(-1);
  });
});
