import { ChevronRight } from 'lucide-react';
import { FrontmatterProperty } from '../lib/markdown';

type FrontmatterPropertiesProps = {
  error: string | null;
  properties: FrontmatterProperty[];
};

export function FrontmatterProperties({ error, properties }: FrontmatterPropertiesProps) {
  if (!error && properties.length === 0) {
    return null;
  }

  return (
    <details className="frontmatter-panel">
      <summary>
        <ChevronRight size={16} />
        <span>{getSummaryLabel(properties.length, error)}</span>
      </summary>
      {error ? (
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
      )}
    </details>
  );
}

function getSummaryLabel(propertyCount: number, error: string | null) {
  if (error) {
    return 'Properties could not be parsed';
  }

  return `${propertyCount} ${propertyCount === 1 ? 'property' : 'properties'}`;
}
