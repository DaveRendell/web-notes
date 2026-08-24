import { HTMLAttributes, useLayoutEffect, useRef, useState } from 'react';

type AnimatedPopoverProps = HTMLAttributes<HTMLDivElement> & {
  isOpen: boolean;
  placementGap?: number;
};

export function AnimatedPopover({
  children,
  className = '',
  isOpen,
  placementGap = 6,
  ...props
}: AnimatedPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');

  useLayoutEffect(() => {
    if (!isOpen) return;

    function updatePlacement() {
      const popover = popoverRef.current;
      const trigger = popover?.previousElementSibling;
      if (!popover || !(trigger instanceof HTMLElement)) return;

      const popoverHeight = popover.getBoundingClientRect().height;
      const triggerRect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - triggerRect.bottom - placementGap;
      const spaceAbove = triggerRect.top - placementGap;
      setPlacement(spaceBelow < popoverHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
    }

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isOpen, placementGap]);

  return (
    <div
      {...props}
      ref={popoverRef}
      aria-hidden={isOpen ? undefined : true}
      className={`${className} dropdown-popover ${isOpen ? 'dropdown-popover-open' : 'dropdown-popover-closing'}`.trim()}
      data-placement={placement}
      inert={!isOpen}
    >
      {children}
    </div>
  );
}
