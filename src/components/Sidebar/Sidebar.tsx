import { AlertCircle, AlertTriangle, FilePlus2, FolderPlus, Loader2 } from 'lucide-react';
import { useVault } from '../../contexts/VaultContext';
import { FileTree } from './FileTree';
import { FavoriteNotes } from './FavoriteNotes';
import { CollapsibleSidebarSection } from './CollapsibleSidebarSection';

export function Sidebar() {
  const {
    createFolder,
    createNote,
    error,
    isLoading,
    isOnline,
    isRefreshing,
    refreshError,
    selectedVault,
    tree,
  } = useVault();

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
      {!isLoading && !error && <FavoriteNotes />}
      <CollapsibleSidebarSection
        className="files-section"
        headingId="files-heading"
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
        {!isLoading && isRefreshing && (
          <div className="status-row sidebar-sync-status">
            <Loader2 className="spin" size={16} />
            <span>Refreshing from Google Drive...</span>
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
