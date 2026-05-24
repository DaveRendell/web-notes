import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { useMarkdownFile } from '../hooks/useMarkdownFile';

export function MarkdownViewer() {
  const { accessToken } = useAuth();
  const { selectedFile } = useVault();
  const { content, error, isLoading } = useMarkdownFile(accessToken, selectedFile?.id ?? null);

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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
      )}
    </main>
  );
}
