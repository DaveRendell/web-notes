import { AlertCircle, AlertTriangle, FilePlus2, FileText, FolderPlus, Loader2 } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useVault } from '../../contexts/VaultContext';
import { getWeeklyNoteDetails } from '../../lib/weeklyNote';
import { flattenVaultNodes, getVaultNodeDisplayName } from '../../lib/vaultTree';
import { Twemoji } from '../Twemoji';
import { FileTree } from './FileTree';
import { FavoriteNotes } from './FavoriteNotes';
import { CollapsibleSidebarSection } from './CollapsibleSidebarSection';

export function Sidebar({ controls }: { controls?: ReactNode }) {
  const {
    createFolder,
    createNote,
    error,
    isLoading,
    isOnline,
    isRefreshing,
    noteIcons,
    openWeeklyNote,
    selectedFile,
    refreshError,
    selectedVault,
    tree,
  } = useVault();
  const [isOpeningWeeklyNote, setIsOpeningWeeklyNote] = useState(false);
  const weeklyDetails = getWeeklyNoteDetails(new Date());
  const flatTree = useMemo(() => flattenVaultNodes(tree), [tree]);
  const weeklyNote = flatTree.find((node) => node.path === weeklyDetails.path && node.type === 'markdown') ?? null;
  const weeklyTemplate = flatTree.find((node) => node.path === 'Templates/Week.md' && node.type === 'markdown') ?? null;
  const weeklyEmoji = weeklyNote
    ? noteIcons[weeklyNote.id]
    : weeklyTemplate ? noteIcons[weeklyTemplate.id] : null;

  async function handleCreateRootNote() {
    const name = window.prompt('New note name');
    if (!name?.trim()) return;

    try {
      await createNote(null, name);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to create note.');
    }
  }

  async function handleCreateRootFolder() {
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;

    try {
      await createFolder(null, name);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to create folder.');
    }
  }

  return (
    <aside className="sidebar" id="vault-sidebar" aria-label="Vault files">
      {controls && <div className="sidebar-toolbar">{controls}</div>}
      {!isLoading && !error && (
        <div className="weekly-note-row">
          <span aria-hidden="true" />
          <button
            className={selectedFile?.id === weeklyNote?.id ? 'favorite-note selected' : 'favorite-note'}
            type="button"
            onClick={() => {
              setIsOpeningWeeklyNote(true);
              void openWeeklyNote()
                .catch((requestError) => window.alert(
                  requestError instanceof Error ? requestError.message : 'Failed to open this week’s note.',
                ))
                .finally(() => setIsOpeningWeeklyNote(false));
            }}
            disabled={isOpeningWeeklyNote || (!weeklyNote && !isOnline)}
            aria-label={`Open this week's note: ${weeklyDetails.filename.replace(/\.md$/i, '')}`}
            title={weeklyNote?.path ?? weeklyDetails.path}
          >
            {weeklyEmoji ? <span className="note-emoji"><Twemoji emoji={weeklyEmoji} hidden /></span> : <FileText size={15} />}
            <span>{weeklyNote ? getVaultNodeDisplayName(weeklyNote) : weeklyDetails.filename.replace(/\.md$/i, '')}</span>
            {isOpeningWeeklyNote && <Loader2 className="spin" size={14} aria-label="Opening weekly note" />}
          </button>
          <span aria-hidden="true" />
        </div>
      )}
      {!isLoading && !error && <FavoriteNotes />}
      <CollapsibleSidebarSection
        className="files-section"
        headingId="files-heading"
        indicator={!isLoading && isRefreshing ? (
          <span
            className="sidebar-section-refreshing"
            role="status"
            aria-label="Refreshing from Google Drive"
            title="Refreshing from Google Drive"
          >
            <Loader2 className="spin" size={13} aria-hidden="true" />
          </span>
        ) : undefined}
        resetKey={selectedVault?.id}
        title="Files"
        actions={
          <>
            <button
              className="icon-button compact-icon"
              type="button"
              onClick={handleCreateRootNote}
              disabled={!isOnline}
              aria-keyshortcuts="Control+Alt+N Meta+Alt+N"
              aria-label="Add note"
              title={isOnline ? 'Add note (Ctrl/Cmd+Alt+N)' : 'Reconnect to the internet to add a note'}
            >
              <FilePlus2 size={16} />
            </button>
            <button
              className="icon-button compact-icon"
              type="button"
              onClick={handleCreateRootFolder}
              disabled={!isOnline}
              aria-label="Add folder"
              title={isOnline ? 'Add folder' : 'Reconnect to the internet to add a folder'}
            >
              <FolderPlus size={16} />
            </button>
          </>
        }
      >
        {isLoading && (
          <div className="status-row">
            <Loader2 className="spin" size={16} />
            <span>Loading vault...</span>
          </div>
        )}
        {refreshError && (
          <div className="status-row warning-text sidebar-sync-status">
            <AlertTriangle size={16} />
            <span>Showing cached files; Drive refresh failed.</span>
          </div>
        )}
        {error && (
          <div className="status-row error-text">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {!isLoading && !error && tree.length === 0 && (
          <p className="empty-state sidebar-empty">No files or folders found.</p>
        )}
        {!isLoading && !error && tree.length > 0 && <FileTree nodes={tree} />}
      </CollapsibleSidebarSection>
    </aside>
  );
}
