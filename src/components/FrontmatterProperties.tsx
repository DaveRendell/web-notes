import { ChevronRight } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { FrontmatterProperty } from '../lib/markdown';

type FrontmatterPropertiesProps = {
  actions: ReactNode;
  error: string | null;
  properties: FrontmatterProperty[];
};

export function FrontmatterProperties({ actions, error, properties }: FrontmatterPropertiesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasProperties = Boolean(error) || properties.length > 0;

  return (
    <section className="frontmatter-panel" aria-label="Note controls">
      <div className="note-toolbar-row">
        {hasProperties && (
          <button
            className="frontmatter-summary"
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            aria-expanded={isOpen}
          >
            <ChevronRight className={isOpen ? 'open' : ''} size={16} />
            <span>{getSummaryLabel(properties.length, error)}</span>
          </button>
        )}
        <div className="note-toolbar-actions">{actions}</div>
      </div>
      {hasProperties && isOpen && (
        error ? (
          <p className="error-text frontmatter-error">{error}</p>
        ) : (
          <table className="frontmatter-table">
            <tbody>
              {properties.map((property) => (
                <tr key={property.key}>
                  <th scope="row">{property.key}</th>
                  <td>{property.value || <span className="muted-text">Empty</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  );
}

function getSummaryLabel(propertyCount: number, error: string | null) {
  if (error) {
    return 'Properties could not be parsed';
  }

  return `${propertyCount} ${propertyCount === 1 ? 'property' : 'properties'}`;
}
