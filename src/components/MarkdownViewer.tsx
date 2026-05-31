import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Edit3, FileText, Loader2, X } from 'lucide-react';
import { MouseEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { useMarkdownFile } from '../hooks/useMarkdownFile';
import { updateDriveFileText } from '../lib/googleDrive';
import {
  convertWikilinksToMarkdown,
  getWikilinkTargetFromHref,
  parseMarkdownWithFrontmatter,
} from '../lib/markdown';
import { FrontmatterProperties } from './FrontmatterProperties';
import { MarkdownEditor } from './MarkdownEditor';

export function MarkdownViewer() {
  const { accessToken } = useAuth();
  const { resolveWikilink, selectFile, selectedFile } = useVault();
  const { content, error, isLoading, setContent } = useMarkdownFile(accessToken, selectedFile?.id ?? null);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const parsedMarkdown = useMemo(() => parseMarkdownWithFrontmatter(content), [content]);
  const markdownBody = useMemo(() => convertWikilinksToMarkdown(parsedMarkdown.body), [parsedMarkdown.body]);
  const hasUnsavedChanges = draft !== content;

  useEffect(() => {
    setDraft(content);
    setIsEditing(false);
    setSaveError(null);
  }, [content, selectedFile?.id]);

  useEffect(() => {
    if (!isEditing || !hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges, isEditing]);

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

  async function handleSave() {
    if (!accessToken || !selectedFile || !hasUnsavedChanges) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      await updateDriveFileText(accessToken, selectedFile.id, draft);
      setContent(draft);
      setIsEditing(false);
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : 'Failed to save markdown file.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setDraft(content);
    setIsEditing(false);
    setSaveError(null);
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
          <p className="eyebrow">{isEditing ? 'Editing markdown' : 'Markdown'}</p>
          <h2>{selectedFile.name}</h2>
        </div>
        <div className="viewer-header-actions">
          <span className="path-label">{selectedFile.path}</span>
          {isEditing ? (
            <div className="edit-actions">
              <button
                className="icon-text-button"
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
              >
                <X size={16} />
                Cancel
              </button>
              <button
                className="primary-button compact"
                type="button"
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              className="icon-text-button"
              type="button"
              onClick={() => {
                setDraft(content);
                setIsEditing(true);
                setSaveError(null);
              }}
              disabled={isLoading || Boolean(error)}
            >
              <Edit3 size={16} />
              Edit
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="status-row viewer-status">
          <Loader2 className="spin" size={16} />
          <span>Loading note...</span>
        </div>
      )}
      {error && <p className="error-text viewer-status">{error}</p>}
      {saveError && <p className="error-text viewer-status">{saveError}</p>}
      {!isLoading && !error && isEditing && (
        <section className="editor-pane" aria-label="Raw markdown editor">
          <MarkdownEditor value={draft} onChange={setDraft} />
        </section>
      )}
      {!isLoading && !error && !isEditing && (
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
