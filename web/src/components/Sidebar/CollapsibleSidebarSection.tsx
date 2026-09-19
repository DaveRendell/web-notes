import { ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

type CollapsibleSidebarSectionProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headingId: string;
  indicator?: ReactNode;
  resetKey?: string | null;
  title: string;
};

export function CollapsibleSidebarSection({
  actions,
  children,
  className,
  headingId,
  indicator,
  resetKey,
  title,
}: CollapsibleSidebarSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setIsOpen(true);
  }, [resetKey]);

  return (
    <section
      className={`sidebar-section${className ? ` ${className}` : ''}${isOpen ? ' is-open' : ''}`}
      aria-labelledby={headingId}
    >
      <div className="sidebar-section-header">
        <button
          className="sidebar-section-toggle"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-controls={`${headingId}-content`}
        >
          <ChevronRight className={isOpen ? 'chevron open' : 'chevron'} size={14} />
          <span className="sidebar-section-title">
            <span id={headingId}>{title}</span>
            {indicator}
          </span>
        </button>
        {actions && <div className="sidebar-section-actions">{actions}</div>}
      </div>
      <div
        className="sidebar-section-content"
        id={`${headingId}-content`}
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
      >
        <div className="sidebar-section-content-inner">
          <div className="sidebar-section-content-body">{children}</div>
        </div>
      </div>
    </section>
  );
}
