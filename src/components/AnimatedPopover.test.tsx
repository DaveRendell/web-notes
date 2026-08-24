import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnimatedPopover } from './AnimatedPopover';

afterEach(cleanup);

describe('AnimatedPopover placement', () => {
  it('opens upward when there is not enough room below the trigger', () => {
    const { container, rerender } = render(
      <div>
        <button type="button">Open</button>
        <AnimatedPopover isOpen={false}>Menu</AnimatedPopover>
      </div>,
    );
    const trigger = container.querySelector('button') as HTMLButtonElement;
    const popover = container.querySelector('.dropdown-popover') as HTMLDivElement;
    trigger.getBoundingClientRect = () => rect({ bottom: 790, top: 760 });
    popover.getBoundingClientRect = () => rect({ height: 120 });

    rerender(
      <div>
        <button type="button">Open</button>
        <AnimatedPopover isOpen>Menu</AnimatedPopover>
      </div>,
    );

    expect(popover.dataset.placement).toBe('top');

    rerender(
      <div>
        <button type="button">Open</button>
        <AnimatedPopover isOpen={false}>Menu</AnimatedPopover>
      </div>,
    );

    expect(popover.dataset.placement).toBe('top');
    expect(popover.classList.contains('dropdown-popover-closing')).toBe(true);
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
