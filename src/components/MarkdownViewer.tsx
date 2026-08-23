import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { Check, Edit3, FileText, Loader2, X } from 'lucide-react';
import {
  Children,
  ChangeEvent,
  cloneElement,
  InputHTMLAttributes,
  isValidElement,
  MouseEvent,
  ReactElement,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Element } from 'hast';
import type { ListItem, Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { useMarkdownFile } from '../hooks/useMarkdownFile';
import { isGoogleDriveAuthError, updateDriveFileText } from '../lib/googleDrive';
import { getVaultNodeDisplayName } from '../lib/vaultTree';
import {
  convertWikilinksToMarkdown,
  type MarkdownTaskCheckbox,
  findMarkdownTaskCheckboxes,
  getWikilinkTargetFromHref,
  parseMarkdownWithFrontmatter,
  toggleMarkdownTaskCheckbox,
} from '../lib/markdown';
import { FrontmatterProperties } from './FrontmatterProperties';
import { MarkdownEditor } from './MarkdownEditor';

export function MarkdownViewer() {
  const { accessToken, ensureAccessToken, invalidateAccessToken } = useAuth();
  const { resolveWikilink, selectFile, selectedFile } = useVault();
  const { content, error, isLoading, setContent } = useMarkdownFile(accessToken, selectedFile?.id ?? null);
  const viewerRef = useRef<HTMLElement>(null);
  const isTaskSaveInFlightRef = useRef(false);
  const isSaveInFlightRef = useRef(false);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [needsAuthReconnect, setNeedsAuthReconnect] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const parsedMarkdown = useMemo(() => parseMarkdownWithFrontmatter(content), [content]);
  const markdownBody = useMemo(() => convertWikilinksToMarkdown(parsedMarkdown.body), [parsedMarkdown.body]);
  const taskCheckboxes = useMemo(() => findMarkdownTaskCheckboxes(content), [content]);
  const taskMetadataPlugin = useMemo(() => createTaskMetadataPlugin(taskCheckboxes), [taskCheckboxes]);
  const hasUnsavedChanges = draft !== content;

  useEffect(() => {
    if (isSaveInFlightRef.current) return;

    setDraft(content);
    setIsEditing(false);
    setNeedsAuthReconnect(false);
    setSaveError(null);
  }, [content, selectedFile?.id]);

  useEffect(() => {
    viewerRef.current?.scrollTo({ top: 0 });
  }, [selectedFile?.id]);

  useEffect(() => {
    if (!isTaskDebugEnabled()) return;

    console.groupCollapsed(
      `[tasks] parsed ${taskCheckboxes.length} checkbox${taskCheckboxes.length === 1 ? '' : 'es'} for ${
        selectedFile?.path ?? 'no note'
      }`,
    );
    console.table(
      taskCheckboxes.map((task, index) => ({
        checked: task.checked,
        index,
        line: task.line,
        markerOffset: task.markerOffset,
        sourcePreview: task.sourcePreview,
      })),
    );
    console.groupEnd();
  }, [selectedFile?.path, taskCheckboxes]);

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

    isSaveInFlightRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    try {
      const validAccessToken = await ensureAccessToken();
      await updateDriveFileText(validAccessToken, selectedFile.id, draft);

      setContent(draft);
      setIsEditing(false);
      setNeedsAuthReconnect(false);
      setSaveError(null);
    } catch (requestError) {
      if (isGoogleDriveAuthError(requestError)) {
        invalidateAccessToken();
        setNeedsAuthReconnect(true);
        setSaveError('Google Drive access expired. Reconnect to retry; your changes are preserved.');
      } else {
        setSaveError(requestError instanceof Error ? requestError.message : 'Failed to save markdown file.');
      }
    } finally {
      isSaveInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleTaskToggle(taskCheckbox: MarkdownTaskCheckbox, checked: boolean) {
    if (!accessToken || !selectedFile) {
      logTaskDebug('toggle skipped: missing auth or selected file', { hasAccessToken: Boolean(accessToken), selectedFile });
      return;
    }

    if (isTaskSaveInFlightRef.current) {
      logTaskDebug('toggle skipped: save already in flight', taskCheckbox);
      return;
    }

    logTaskDebug('toggle requested', {
      nextChecked: checked,
      task: taskCheckbox,
      sourceAroundMarker: getSourceAroundOffset(content, taskCheckbox.markerOffset),
    });

    const nextContent = toggleMarkdownTaskCheckbox(content, taskCheckbox.markerOffset, checked);

    if (nextContent === content) {
      logTaskDebug('toggle produced no content change', {
        markerCharacter: content[taskCheckbox.markerOffset],
        markerOffset: taskCheckbox.markerOffset,
        sourceAroundMarker: getSourceAroundOffset(content, taskCheckbox.markerOffset),
      });
      return;
    }

    isTaskSaveInFlightRef.current = true;
    setIsSavingTask(true);
    setContent(nextContent);
    setSaveError(null);

    try {
      const validAccessToken = await ensureAccessToken();
      await updateDriveFileText(validAccessToken, selectedFile.id, nextContent);
      logTaskDebug('toggle saved', {
        note: selectedFile.path,
        nextChecked: checked,
        task: taskCheckbox,
      });
    } catch (requestError) {
      setContent(content);

      if (isGoogleDriveAuthError(requestError)) {
        invalidateAccessToken();
        setSaveError('Google Drive access expired. Select the checkbox again to reconnect and retry.');
      } else {
        setSaveError(requestError instanceof Error ? requestError.message : 'Failed to update checkbox.');
      }

      logTaskDebug('toggle save failed', requestError);
    } finally {
      isTaskSaveInFlightRef.current = false;
      setIsSavingTask(false);
    }
  }

  function handleCancel() {
    setDraft(content);
    setIsEditing(false);
    setNeedsAuthReconnect(false);
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
    <main className="viewer" ref={viewerRef}>
      <div className="viewer-header">
        <div>
          <h2 title={selectedFile.path}>{getVaultNodeDisplayName(selectedFile)}</h2>
        </div>
        <div className="viewer-header-actions">
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
                {isSaving
                  ? needsAuthReconnect
                    ? 'Reconnecting...'
                    : 'Saving...'
                  : needsAuthReconnect
                    ? 'Reconnect & save'
                    : 'Save'}
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
              li: ({ children, node, ...props }) => {
                const taskCheckbox = getTaskCheckboxFromNode(node);

                return (
                  <li {...props}>
                    {taskCheckbox
                      ? injectTaskCheckboxHandler(children, {
                          isSavingTask,
                          onToggle: (checked) => void handleTaskToggle(taskCheckbox, checked),
                          taskCheckbox,
                        })
                      : children}
                  </li>
                );
              },
            }}
            remarkPlugins={[remarkGfm, remarkBreaks, taskMetadataPlugin]}
          >
            {markdownBody}
          </ReactMarkdown>
        </article>
      )}
    </main>
  );
}

const TASK_DEBUG_KEY = 'vault-web-viewer:debug-tasks';

function isTaskDebugEnabled() {
  return localStorage.getItem(TASK_DEBUG_KEY) === 'true';
}

function logTaskDebug(message: string, detail?: unknown) {
  if (!isTaskDebugEnabled()) return;

  console.debug(`[tasks] ${message}`, detail ?? '');
}

function getSourceAroundOffset(content: string, offset: number) {
  return content
    .slice(Math.max(0, offset - 80), Math.min(content.length, offset + 80))
    .replace(/\n/g, '\\n');
}

function createTaskMetadataPlugin(taskCheckboxes: MarkdownTaskCheckbox[]): Plugin<[], Root> {
  return () => (tree) => {
    let taskIndex = 0;

    visit(tree, 'listItem', (node: ListItem) => {
      if (typeof node.checked !== 'boolean') return;

      const taskCheckbox = taskCheckboxes[taskIndex];
      taskIndex += 1;

      node.data = {
        ...node.data,
        hProperties: {
          ...node.data?.hProperties,
          dataTaskChecked: taskCheckbox?.checked,
          dataTaskLine: taskCheckbox?.line,
          dataTaskMarkerOffset: taskCheckbox?.markerOffset,
          dataTaskPreview: taskCheckbox?.sourcePreview,
        },
      };

      logTaskDebug('assign task metadata', {
        renderedTaskIndex: taskIndex - 1,
        task: taskCheckbox ?? null,
      });
    });
  };
}

function getTaskCheckboxFromNode(node: Element | undefined): MarkdownTaskCheckbox | null {
  const properties = node?.properties;

  if (!properties) {
    return null;
  }

  const markerOffset = properties?.dataTaskMarkerOffset;

  if (typeof markerOffset !== 'number') {
    return null;
  }

  return {
    checked: properties.dataTaskChecked === true,
    line: typeof properties.dataTaskLine === 'number' ? properties.dataTaskLine : 0,
    markerOffset,
    sourcePreview: typeof properties.dataTaskPreview === 'string' ? properties.dataTaskPreview : '',
  };
}

function injectTaskCheckboxHandler(
  children: ReactNode,
  options: {
    isSavingTask: boolean;
    onToggle: (checked: boolean) => void;
    taskCheckbox: MarkdownTaskCheckbox;
  },
): ReactNode {
  let didInject = false;

  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;

    if (!didInject && child.type === 'input') {
      didInject = true;
      logTaskDebug('render task checkbox', options.taskCheckbox);

      return cloneElement(child as ReactElement<InputHTMLAttributes<HTMLInputElement>>, {
        disabled: options.isSavingTask,
        onChange: (event: ChangeEvent<HTMLInputElement>) => options.onToggle(event.currentTarget.checked),
      } satisfies InputHTMLAttributes<HTMLInputElement>);
    }

    return child;
  });
}
