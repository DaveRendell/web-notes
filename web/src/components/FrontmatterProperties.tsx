import { PanelLeftOpen, X } from 'lucide-react';
import { Fragment, ReactNode } from 'react';
import { FrontmatterProperty } from '../lib/markdown';
import { AppModal } from './AppModal';

type FrontmatterPropertiesProps = {
  actions: ReactNode;
  error: string | null;
  isPropertiesOpen: boolean;
  navigation?: ReactNode;
  onCloseProperties: () => void;
  onOpenSidebar?: () => void;
  properties: FrontmatterProperty[];
  status?: ReactNode;
};

export function FrontmatterProperties({ actions, error, isPropertiesOpen, navigation, onCloseProperties, onOpenSidebar, properties, status }: FrontmatterPropertiesProps) {
  return (
    <>
      <header className="frontmatter-panel" aria-label="Note controls">
        <div className="note-toolbar-row">
          <div className="note-toolbar-leading">
            {onOpenSidebar && (
              <button className="icon-button" type="button" onClick={onOpenSidebar} aria-label="Show file sidebar" title="Show file sidebar">
                <PanelLeftOpen size={18} />
              </button>
            )}
          </div>
          <div className="note-toolbar-controls">
            {status}
            {navigation && <div className="note-toolbar-navigation">{navigation}</div>}
            <div className="note-toolbar-actions">{actions}</div>
          </div>
        </div>
      </header>
      <AppModal className="properties-modal" isOpen={isPropertiesOpen} onClose={onCloseProperties} title="Note properties">
        <button className="icon-button app-modal-close" type="button" onClick={onCloseProperties} aria-label="Close properties">
          <X size={18} />
        </button>
        {error ? (
          <p className="error-text frontmatter-error">{error}</p>
        ) : properties.length === 0 ? (
          <p className="muted-text properties-empty">This note has no frontmatter properties.</p>
        ) : (
          <div className="properties-table-scroll">
            <table className="frontmatter-table">
              <tbody>
                {properties.map((property) => (
                  <tr key={property.key}>
                    <th scope="row">{property.key}</th>
                    <td>{property.value ? <LinkedPropertyValue value={property.value} /> : <span className="muted-text">Empty</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AppModal>
    </>
  );
}

const MARKDOWN_LINK_PATTERN = /^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function LinkedPropertyValue({ value }: { value: string }) {
  const markdownLink = value.match(MARKDOWN_LINK_PATTERN);
  if (markdownLink) return <PropertyLink href={markdownLink[2]} label={markdownLink[1]} />;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const { href, trailing } = trimTrailingPunctuation(match[0]);
    parts.push(value.slice(lastIndex, start));
    parts.push(<PropertyLink href={href} label={href} key={`${start}-${href}`} />);
    if (trailing) parts.push(trailing);
    lastIndex = start + match[0].length;
  }
  parts.push(value.slice(lastIndex));
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
}

function PropertyLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer">{label}</a>;
}

function trimTrailingPunctuation(value: string) {
  const href = value.replace(/[),.;\]]+$/, '');
  return { href, trailing: value.slice(href.length) };
}
