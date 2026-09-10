import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

type AppModalProps = {
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
};

export function AppModal({ children, className = '', isOpen, onClose, title }: AppModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = getFocusableElements(panel);
    (focusable[0] ?? panel)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = getFocusableElements(panelRef.current);
      if (elements.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        elements.at(-1)?.focus();
      } else if (!event.shiftKey && currentIndex === elements.length - 1) {
        event.preventDefault();
        elements[0]?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="app-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={`app-modal ${className}`.trim()}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
  ));
}
