import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Loader2 } from 'lucide-react';
import { MouseEvent, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { useMarkdownFile } from '../hooks/useMarkdownFile';
import {
  convertWikilinksToMarkdown,
  getWikilinkTargetFromHref,
  parseMarkdownWithFrontmatter,
} from '../lib/markdown';
import { FrontmatterProperties } from './FrontmatterProperties';

export function MarkdownViewer() {
  const { accessToken } = useAuth();
  const { resolveWikilink, selectFile, selectedFile } = useVault();
  const { content, error, isLoading } = useMarkdownFile(accessToken, selectedFile?.id ?? null);
  const parsedMarkdown = useMemo(() => parseMarkdownWithFrontmatter(content), [content]);
  const markdownBody = useMemo(() => convertWikilinksToMarkdown(parsedMarkdown.body), [parsedMarkdown.body]);

  function handleLinkClick(href: string | undefined, event: MouseEvent<HTMLAnchorElement>) {
    if (!href) return;

    const wikilinkTarget = getWikilinkTargetFromHref(href);
    if (!wikilinkTarget) return;

    event.preventDefault();
    const linkedFile = resolveWikilink(wikilinkTarget);

    if (linkedFile) {
      selectFile(linkedFile);
    }
  }

  if (!selectedFile) {
    return (
      <main className="viewer empty-viewer">
        <FileText size={38} />
        <h2>Select a markdown file</h2>
        <p>Choose a note from the sidebar to render it here.</p>
      </main>
    );
  }

  return (
    <main className="viewer">
      <div className="viewer-header">
        <div>
          <p className="eyebrow">Markdown</p>
          <h2>{selectedFile.name}</h2>
        </div>
        <span className="path-label">{selectedFile.path}</span>
      </div>

      {isLoading && (
        <div className="status-row viewer-status">
          <Loader2 className="spin" size={16} />
          <span>Loading note...</span>
        </div>
      )}
      {error && <p className="error-text viewer-status">{error}</p>}
      {!isLoading && !error && (
        <article className="markdown-body">
          <FrontmatterProperties
            error={parsedMarkdown.frontmatterError}
            properties={parsedMarkdown.frontmatter}
          />
          <ReactMarkdown
            components={{
              a: ({ href, children }) => {
                const wikilinkTarget = href ? getWikilinkTargetFromHref(href) : null;
                const linkedFile = wikilinkTarget ? resolveWikilink(wikilinkTarget) : null;

                return (
                  <a
                    className={wikilinkTarget ? (linkedFile ? 'wikilink' : 'wikilink missing') : undefined}
                    href={href}
                    onClick={(event) => handleLinkClick(href, event)}
                    title={wikilinkTarget && !linkedFile ? `Not found: ${wikilinkTarget}` : undefined}
                  >
                    {children}
                  </a>
                );
              },
            }}
            remarkPlugins={[remarkGfm]}
          >
            {markdownBody}
          </ReactMarkdown>
        </article>
      )}
    </main>
  );
}
