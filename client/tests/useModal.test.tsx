import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useModal } from '../src/features/Recipes/hooks/useModal.js';

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Test dialog">
      <button type="button">first</button>
      <button type="button">middle</button>
      <button type="button">last</button>
    </div>
  );
}

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <button type="button">opener</button>
      {open && <Dialog onClose={onClose} />}
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

describe('useModal', () => {
  it('locks_backgroundScroll_whileOpen', () => {
    const { unmount } = render(<Dialog onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes_onEscape', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returnsFocus_toTheOpener_onClose', () => {
    const { rerender } = render(<Harness open={false} onClose={vi.fn()} />);
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();

    rerender(<Harness open onClose={vi.fn()} />);
    screen.getByRole('button', { name: 'last' }).focus();
    rerender(<Harness open={false} onClose={vi.fn()} />);

    expect(document.activeElement).toBe(opener);
  });

  it('wrapsFocus_fromLastToFirst_onTab', () => {
    render(<Dialog onClose={vi.fn()} />);
    const last = screen.getByRole('button', { name: 'last' });
    last.focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    // Without a trap, Tab here would escape the dialog into the page behind it.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'first' }));
  });

  it('wrapsFocus_fromFirstToLast_onShiftTab', () => {
    render(<Dialog onClose={vi.fn()} />);
    const first = screen.getByRole('button', { name: 'first' });
    first.focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'last' }));
  });

  it('leavesTab_alone_inTheMiddleOfTheDialog', () => {
    render(<Dialog onClose={vi.fn()} />);
    const middle = screen.getByRole('button', { name: 'middle' });
    middle.focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    // The browser handles ordinary forward movement; the trap only wraps the ends.
    expect(document.activeElement).toBe(middle);
  });
});
