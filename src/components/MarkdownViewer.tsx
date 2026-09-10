import { Check, ChevronLeft, ChevronRight, EllipsisVertical, FileCode2, FileText, Loader2, Pencil, Star, StarOff, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { useMarkdownFile } from '../hooks/useMarkdownFile';
import { isGoogleDriveAuthError, updateDriveFileText } from '../lib/googleDrive';
import { parseMarkdownWithFrontmatter } from '../lib/markdown';
import { getNoteSequenceNavigation } from '../lib/noteSequence';
import { putNoteContent } from '../lib/vaultCache';
import { AnimatedPopover } from './AnimatedPopover';
import { FrontmatterProperties } from './FrontmatterProperties';
import { NoteEditorShell, type NoteEditorMode } from './NoteEditorShell';

const RICH_AUTOSAVE_DELAY_MS = 1000;

type QueuedNoteSave = {
  content: string;
  note: NonNullable<ReturnType<typeof useVault>['selectedFile']>;
};

export function MarkdownViewer() {
  const { accessToken, accountId, ensureAccessToken, invalidateAccessToken } = useAuth();
  const {
    cacheNoteIcon,
    deleteNote,
    favoriteNoteIds,
    isOnline,
    notes,
    recentNotes,
    renameNote,
    selectFile,
    selectedFile,
    selectedVault,
    storeSavedNote,
    toggleFavorite,
  } = useVault();
  const selectedVaultId = selectedVault?.id ?? null;
  const { cacheContent, content, error, isLoading, isRefreshing, refreshError, setContent } = useMarkdownFile(
    accessToken,
    accountId,
    selectedVaultId,
    selectedFile,
  );
  const noteContentRef = useRef<HTMLDivElement>(null);
  const noteMenuRef = useRef<HTMLDivElement>(null);
  const isSaveInFlightRef = useRef(false);
  const queuedSavesRef = useRef(new Map<string, QueuedNoteSave>());
  const processSaveQueueRef = useRef<() => void>(() => undefined);
  const acceptedContentUpdateRef = useRef<{ content: string; fileId: string } | null>(null);
  const selectedFileRef = useRef(selectedFile);
  const draftRef = useRef('');
  const previousContentRef = useRef(content);
  const previousFileIdRef = useRef(selectedFile?.id);
  const previousFileRef = useRef(selectedFile);
  const [draft, setDraft] = useState('');
  const [readyFileId, setReadyFileId] = useState<string | null>(null);
  const previousReadyFileIdRef = useRef<string | null>(null);
  const canSaveRef = useRef(false);
  const canSave = Boolean(selectedFile && readyFileId === selectedFile.id && !isLoading && !error);
  canSaveRef.current = canSave;
  const [editorMode, setEditorMode] = useState<NoteEditorMode>('rich');
  const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
  const [needsAuthReconnect, setNeedsAuthReconnect] = useState(false);
  const [hasFailedSave, setHasFailedSave] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isNoteMenuOpen, setIsNoteMenuOpen] = useState(false);
  const parsedMarkdown = useMemo(() => parseMarkdownWithFrontmatter(draft), [draft]);
  const sequenceNavigation = useMemo(
    () => selectedFile ? getNoteSequenceNavigation(selectedFile, notes) : null,
    [notes, selectedFile],
  );
  const hasUnsavedChanges = draft !== content;

  draftRef.current = draft;
  selectedFileRef.current = selectedFile;

  const cacheLocalDraft = useCallback((note: QueuedNoteSave['note'], nextContent: string) => {
    if (!accountId || !selectedVaultId) return;
    void putNoteContent({
      accountId,
      vaultId: selectedVaultId,
      fileId: note.id,
      content: nextContent,
      cachedAt: Date.now(),
    });
  }, [accountId, selectedVaultId]);

  const queueNoteSave = useCallback((note: QueuedNoteSave['note'], nextContent: string) => {
    queuedSavesRef.current.set(note.id, { content: nextContent, note });
    cacheLocalDraft(note, nextContent);
    setIsSaving(true);
    processSaveQueueRef.current();
  }, [cacheLocalDraft]);

  processSaveQueueRef.current = () => {
    if (isSaveInFlightRef.current) return;
    const queued = queuedSavesRef.current.entries().next().value as [string, QueuedNoteSave] | undefined;
    if (!queued) {
      setIsSaving(false);
      return;
    }

    const [noteId, save] = queued;
    queuedSavesRef.current.delete(noteId);
    isSaveInFlightRef.current = true;
    setIsSaving(true);

    void (async () => {
      try {
        const validAccessToken = await ensureAccessToken();
        const updatedFile = await updateDriveFileText(validAccessToken, save.note.id, save.content);
        const newerSave = queuedSavesRef.current.get(save.note.id);

        // Always advance the Drive metadata, but never let an older response replace a
        // newer local draft in IndexedDB.
        storeSavedNote(save.note, updatedFile, newerSave ? undefined : save.content);
        if (selectedFileRef.current?.id === save.note.id && !newerSave && draftRef.current === save.content) {
          acceptedContentUpdateRef.current = { content: save.content, fileId: save.note.id };
          setContent(save.content);
          setHasRemoteUpdate(false);
          setNeedsAuthReconnect(false);
          setHasFailedSave(false);
          setSaveError(null);
        }
      } catch (requestError) {
        if (isGoogleDriveAuthError(requestError)) invalidateAccessToken();
        if (selectedFileRef.current?.id === save.note.id) {
          setHasFailedSave(true);
          if (isGoogleDriveAuthError(requestError)) {
            setNeedsAuthReconnect(true);
            setSaveError('Google Drive access expired. Reconnect to retry; your changes are preserved locally.');
          } else {
            setSaveError(requestError instanceof Error ? requestError.message : 'Failed to save markdown file.');
          }
        } else {
          console.warn('Could not save the note before navigation; the draft remains in the local cache.', requestError);
        }
      } finally {
        isSaveInFlightRef.current = false;
        processSaveQueueRef.current();
      }
    })();
  };

  useEffect(() => {
    if (!accessToken || !selectedFile || isLoading || error) return;
    cacheNoteIcon(selectedFile.id, content);
  }, [accessToken, cacheNoteIcon, content, error, isLoading, selectedFile]);

  useEffect(() => {
    const previousContent = previousContentRef.current;
    const previousFile = previousFileRef.current;
    const fileChanged = previousFileIdRef.current !== selectedFile?.id;
    const previousReadyFileId = previousReadyFileIdRef.current;
    previousReadyFileIdRef.current = !isLoading && !error ? selectedFile?.id ?? null : null;
    previousContentRef.current = content;
    previousFileIdRef.current = selectedFile?.id;
    previousFileRef.current = selectedFileRef.current;

    if (fileChanged) {
      const departingDraft = draftRef.current;
      if (
        previousFile &&
        previousReadyFileId === previousFile.id &&
        departingDraft !== previousContent &&
        accessToken &&
        accountId &&
        selectedVaultId &&
        isOnline
      ) {
        queueNoteSave(previousFile, departingDraft);
      }

      setDraft(content);
      setReadyFileId(!isLoading && !error ? selectedFile?.id ?? null : null);
      setEditorMode('rich');
      setHasRemoteUpdate(false);
      setNeedsAuthReconnect(false);
      setHasFailedSave(false);
      setSaveError(null);
      setIsSaving(isSaveInFlightRef.current || queuedSavesRef.current.size > 0);
      return;
    }

    if (isLoading || error) {
      setReadyFileId(null);
      return;
    }

    // Hydrate the draft before mounting the editor or permitting any save path.
    if (previousReadyFileId !== selectedFile?.id) {
      setDraft(content);
      setReadyFileId(selectedFile?.id ?? null);
      setHasRemoteUpdate(false);
      return;
    }

    if (isSaveInFlightRef.current) return;

    const acceptedUpdate = acceptedContentUpdateRef.current;
    if (acceptedUpdate && acceptedUpdate.fileId === selectedFile?.id && acceptedUpdate.content === content) {
      acceptedContentUpdateRef.current = null;
      setDraft(content);
      setHasRemoteUpdate(false);
      return;
    }

    if (content !== previousContent && draftRef.current !== previousContent) {
      setHasRemoteUpdate(true);
      return;
    }

    setDraft(content);
    setHasRemoteUpdate(false);
  }, [
    accessToken,
    accountId,
    content,
    error,
    isLoading,
    isOnline,
    queueNoteSave,
    selectedFile,
    selectedFile?.id,
    selectedVaultId,
  ]);

  useEffect(() => {
    noteContentRef.current?.scrollTo({ top: 0 });
    setIsNoteMenuOpen(false);
  }, [selectedFile?.id]);

  useEffect(() => {
    if (!isNoteMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!noteMenuRef.current?.contains(event.target as Node)) setIsNoteMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsNoteMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNoteMenuOpen]);

  const persistDraft = useCallback(async (returnToRich = false) => {
    if (!canSaveRef.current || !accessToken || !selectedFile || !isOnline) return;
    if (!hasUnsavedChanges && !hasFailedSave) {
      if (returnToRich) setEditorMode('rich');
      return;
    }

    const nextContent = draftRef.current;
    setHasFailedSave(false);
    setSaveError(null);
    cacheContent(nextContent);
    if (returnToRich) setEditorMode('rich');
    queueNoteSave(selectedFile, nextContent);
  }, [
    accessToken,
    cacheContent,
    hasFailedSave,
    hasUnsavedChanges,
    isOnline,
    queueNoteSave,
    selectedFile,
  ]);

  useEffect(() => {
    if (!canSave || editorMode !== 'rich' || !hasUnsavedChanges || hasFailedSave || isSaving || !isOnline) return;
    const timeout = window.setTimeout(() => void persistDraft(), RICH_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [canSave, draft, editorMode, hasFailedSave, hasUnsavedChanges, isOnline, isSaving, persistDraft]);

  useEffect(() => {
    if ((!hasUnsavedChanges && !hasFailedSave) || !selectedFile) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasFailedSave, hasUnsavedChanges, selectedFile]);

  function handleDraftChange(nextDraft: string) {
    if (!canSaveRef.current) return;
    setDraft(nextDraft);
    if (selectedFile) {
      cacheLocalDraft(selectedFile, nextDraft);
      if (isSaveInFlightRef.current || queuedSavesRef.current.has(selectedFile.id)) {
        queuedSavesRef.current.set(selectedFile.id, { content: nextDraft, note: selectedFile });
      }
    }
    if (nextDraft !== draftRef.current) {
      setHasFailedSave(false);
      setNeedsAuthReconnect(false);
      setSaveError(null);
    }
  }

  function handleCancelSourceEdit() {
    setDraft(content);
    setEditorMode('rich');
    setHasRemoteUpdate(false);
    setNeedsAuthReconnect(false);
    setHasFailedSave(false);
    setSaveError(null);
  }

  async function handleRenameNote() {
    if (!selectedFile) return;
    const name = window.prompt('Rename note', selectedFile.name);
    if (!name?.trim() || name.trim() === selectedFile.name) return;

    try {
      await renameNote(selectedFile, name);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to rename note.');
    }
  }

  async function handleDeleteNote() {
    if (!selectedFile || !window.confirm(`Delete ${selectedFile.name}?`)) return;

    try {
      await deleteNote(selectedFile);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to delete note.');
    }
  }

  function runNoteMenuAction(action: () => void | Promise<void>) {
    setIsNoteMenuOpen(false);
    void action();
  }

  if (!selectedFile) {
    return (
      <main className="viewer empty-viewer">
        <FileText size={38} />
        <h2>Select a markdown file</h2>
        <p>Choose a note from the sidebar to open it here.</p>
      </main>
    );
  }

  return (
    <main className="viewer">
      <FrontmatterProperties
        key={selectedFile.id}
        error={parsedMarkdown.frontmatterError}
        properties={parsedMarkdown.frontmatter}
        status={isSaving || isRefreshing ? (
          <span className="note-save-status" role="status">
            <Loader2 className="spin" size={16} />
            {isSaving ? 'Saving...' : 'Syncing...'}
          </span>
        ) : undefined}
        navigation={sequenceNavigation && (sequenceNavigation.previous || sequenceNavigation.next) ? (
          <nav className="note-sequence-navigation" aria-label="Sequential notes">
            <button
              className="note-sequence-button"
              type="button"
              onClick={() => sequenceNavigation.previous && selectFile(sequenceNavigation.previous)}
              disabled={!sequenceNavigation.previous}
              aria-label={`Previous note: ${sequenceNavigation.previousNumber}`}
              title={sequenceNavigation.previous?.path ?? `No note for ${sequenceNavigation.previousNumber}`}
            >
              <ChevronLeft size={16} />
              <span>{sequenceNavigation.previousNumber}</span>
            </button>
            <span className="note-sequence-current" aria-label={`Current note: ${sequenceNavigation.currentNumber}`}>
              {sequenceNavigation.currentNumber}
            </span>
            <button
              className="note-sequence-button"
              type="button"
              onClick={() => sequenceNavigation.next && selectFile(sequenceNavigation.next)}
              disabled={!sequenceNavigation.next}
              aria-label={`Next note: ${sequenceNavigation.nextNumber}`}
              title={sequenceNavigation.next?.path ?? `No note for ${sequenceNavigation.nextNumber}`}
            >
              <span>{sequenceNavigation.nextNumber}</span>
              <ChevronRight size={16} />
            </button>
          </nav>
        ) : undefined}
        actions={
          <>
            {!isSaving && (editorMode === 'source' ? (
              <div className="edit-actions">
                <button className="icon-text-button" type="button" onClick={handleCancelSourceEdit}>
                  <X size={16} />
                  Cancel
                </button>
                <button
                  className="primary-button compact"
                  type="button"
                  onClick={() => void persistDraft(true)}
                  disabled={(!hasUnsavedChanges && !hasFailedSave) || !isOnline}
                >
                  <Check size={16} />
                  {needsAuthReconnect ? 'Reconnect & save' : 'Save'}
                </button>
              </div>
            ) : hasFailedSave ? (
              <button className="icon-text-button" type="button" onClick={() => void persistDraft()} disabled={!isOnline}>
                {needsAuthReconnect ? 'Reconnect & save' : 'Retry save'}
              </button>
            ) : null)}
            <div className="editor-mode-switch" role="group" aria-label="Editor mode">
              <button
                aria-label="Rich text"
                className={`editor-mode-icon-button${editorMode === 'rich' ? ' active' : ''}`}
                disabled={isSaving}
                title="Rich text"
                type="button"
                onClick={() => setEditorMode('rich')}
              >
                <FileText size={16} />
              </button>
              <button
                aria-label="Markdown"
                className={`editor-mode-icon-button${editorMode === 'source' ? ' active' : ''}`}
                disabled={isSaving}
                title="Markdown source"
                type="button"
                onClick={() => setEditorMode('source')}
              >
                <FileCode2 size={16} />
              </button>
            </div>
            <div className="note-actions-menu" ref={noteMenuRef}>
              <button
                className="icon-button"
                type="button"
                onClick={() => setIsNoteMenuOpen((current) => !current)}
                aria-expanded={isNoteMenuOpen}
                aria-haspopup="menu"
                aria-label="Note actions"
                title="Note actions"
              >
                <EllipsisVertical size={18} />
              </button>
              <AnimatedPopover className="header-menu-popover" isOpen={isNoteMenuOpen} role="menu">
                <button type="button" role="menuitem" onClick={() => runNoteMenuAction(() => toggleFavorite(selectedFile.id))}>
                  {favoriteNoteIds.includes(selectedFile.id) ? <StarOff size={16} /> : <Star size={16} />}
                  <span>{favoriteNoteIds.includes(selectedFile.id) ? 'Remove favourite' : 'Add favourite'}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => runNoteMenuAction(handleRenameNote)} disabled={!isOnline || hasUnsavedChanges || hasFailedSave || isSaving}>
                  <Pencil size={16} />
                  <span>Rename note</span>
                </button>
                <button className="danger" type="button" role="menuitem" onClick={() => runNoteMenuAction(handleDeleteNote)} disabled={!isOnline || hasUnsavedChanges || hasFailedSave || isSaving}>
                  <Trash2 size={16} />
                  <span>Delete note</span>
                </button>
              </AnimatedPopover>
            </div>
          </>
        }
      />

      <div className="note-content-area editing" ref={noteContentRef}>
        {isLoading && <div className="status-row viewer-status"><Loader2 className="spin" size={16} /><span>Loading note...</span></div>}
        {error && <p className="error-text viewer-status">{error}</p>}
        {!isOnline && <p className="warning-text viewer-status">Offline: cached notes are read-only until the internet connection returns.</p>}
        {refreshError && <p className="warning-text viewer-status">Showing cached content; Drive refresh failed: {refreshError}</p>}
        {hasRemoteUpdate && <p className="warning-text viewer-status">This note changed in Google Drive while you were editing. Saving will overwrite it with your draft.</p>}
        {saveError && <p className="error-text viewer-status">{saveError}</p>}
        {canSave && (
          <section className="editor-pane" aria-label="Note editor">
            <NoteEditorShell
              blockMovementDisabled={!isOnline}
              key={selectedFile.id}
              mode={editorMode}
              notes={notes}
              value={draft}
              onBlur={() => void persistDraft()}
              onChange={handleDraftChange}
              onSave={() => void persistDraft(true)}
              readOnly={!isOnline}
              recentNotes={recentNotes}
            />
          </section>
        )}
      </div>
    </main>
  );
}
