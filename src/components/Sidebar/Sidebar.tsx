import { AlertCircle, Loader2 } from 'lucide-react';
import { useVault } from '../../contexts/VaultContext';
import { FileTree } from './FileTree';

export function Sidebar() {
  const { error, isLoading, tree } = useVault();

  return (
    <aside className="sidebar" aria-label="Vault files">
      <div className="sidebar-header">
        <h2>Files</h2>
      </div>
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
