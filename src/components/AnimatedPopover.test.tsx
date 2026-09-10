import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedPopover } from './AnimatedPopover';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AnimatedPopover placement', () => {
  it('does not mount a menu that has never been opened', () => {
    const { container } = render(<AnimatedPopover isOpen={false}>Menu</AnimatedPopover>);
    expect(container.querySelector('.dropdown-popover')).toBeNull();
  });

  it('opens upward, preserves placement during fade-out, then unmounts', () => {
    vi.useFakeTimers();
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this instanceof HTMLButtonElement) return rect({ bottom: 790, top: 760 });
      if (this.classList.contains('dropdown-popover')) return rect({ height: 120 });
      return rect({});
    });
    const { container, rerender } = render(
      <div>
        <button type="button">Open</button>
        <AnimatedPopover isOpen>Menu</AnimatedPopover>
      </div>,
    );
    const popover = container.querySelector('.dropdown-popover') as HTMLDivElement;

    expect(popover.dataset.placement).toBe('top');

    rerender(
      <div>
        <button type="button">Open</button>
        <AnimatedPopover isOpen={false}>Menu</AnimatedPopover>
      </div>,
    );

    expect(popover.dataset.placement).toBe('top');
    expect(popover.classList.contains('dropdown-popover-closing')).toBe(true);

    act(() => vi.advanceTimersByTime(100));
    expect(container.querySelector('.dropdown-popover')).toBeNull();
    rectSpy.mockRestore();
  });

  it('closes with Escape and restores focus to its trigger', async () => {
    function Menu() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>Open menu</button>
          <AnimatedPopover isOpen={open} onEscape={() => setOpen(false)} role="menu">
            <button type="button">Action</button>
          </AnimatedPopover>
        </div>
      );
    }

    render(<Menu />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(trigger);
    screen.getByRole('button', { name: 'Action' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

function rect(values: Partial<DOMRect>): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...values,
  };
}
