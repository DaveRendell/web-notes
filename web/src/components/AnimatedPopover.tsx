import { HTMLAttributes, useEffect, useLayoutEffect, useRef, useState } from 'react';

const FADE_OUT_DURATION_MS = 100;

type AnimatedPopoverProps = HTMLAttributes<HTMLDivElement> & {
  isOpen: boolean;
  onEscape?: () => void;
  placementGap?: number;
};

export function AnimatedPopover({
  children,
  className = '',
  isOpen,
  onEscape,
  placementGap = 6,
  ...props
}: AnimatedPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const onEscapeRef = useRef(onEscape);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [isPresent, setIsPresent] = useState(isOpen);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!isOpen || !onEscapeRef.current) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const trigger = popoverRef.current?.previousElementSibling;
      onEscapeRef.current?.();
      if (trigger instanceof HTMLElement) trigger.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsPresent(true);
      return;
    }

    if (!isPresent) return;
    const timeout = window.setTimeout(() => setIsPresent(false), FADE_OUT_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [isOpen, isPresent]);

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

  if (!isOpen && !isPresent) return null;

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
