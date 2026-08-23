import { AlertCircle, FilePlus2, Loader2 } from 'lucide-react';
import { useVault } from '../../contexts/VaultContext';
import { FileTree } from './FileTree';
import { RecentNotes } from './RecentNotes';

export function Sidebar() {
  const { createNote, error, isLoading, tree } = useVault();

  async function handleCreateRootNote() {
    const name = window.prompt('New note name');
    if (!name?.trim()) return;

    try {
      await createNote(null, name);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to create note.');
    }
  }

  return (
    <aside className="sidebar" id="vault-sidebar" aria-label="Vault files">
      <div className="sidebar-header">
        <h2>Files</h2>
        <button
          className="icon-button compact-icon"
          type="button"
          onClick={handleCreateRootNote}
          aria-label="Add note"
          title="Add note"
        >
          <FilePlus2 size={16} />
        </button>
      </div>
      {!isLoading && !error && <RecentNotes />}
      {isLoading && (
        <div className="status-row">
          <Loader2 className="spin" size={16} />
          <span>Loading vault...</span>
        </div>
      )}
      {error && (
        <div className="status-row error-text">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {!isLoading && !error && tree.length === 0 && <p className="empty-state sidebar-empty">No markdown files found.</p>}
      {!isLoading && !error && tree.length > 0 && <FileTree nodes={tree} />}
    </aside>
  );
}
