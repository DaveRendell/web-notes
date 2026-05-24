import { ChevronLeft, Folder, Home } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { useDriveFolders } from '../hooks/useDriveFolders';
import { DriveFile } from '../types/drive';

type FolderCrumb = {
  id: string;
  name: string;
};

const ROOT_FOLDER: FolderCrumb = {
  id: 'root',
  name: 'My Drive',
};

export function VaultPicker() {
  const { accessToken } = useAuth();
  const { selectVault } = useVault();
  const [folderStack, setFolderStack] = useState<FolderCrumb[]>([ROOT_FOLDER]);
  const currentFolder = folderStack[folderStack.length - 1];
  const { error, folders, isLoading } = useDriveFolders(accessToken, currentFolder.id);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
    [folders],
  );

  function openFolder(folder: DriveFile) {
    setFolderStack((current) => [...current, { id: folder.id, name: folder.name }]);
  }

  function goBack() {
    setFolderStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }

  return (
    <section className="vault-picker" aria-label="Vault folder picker">
      <div className="picker-toolbar">
        <button className="icon-text-button" type="button" onClick={goBack} disabled={folderStack.length === 1}>
          <ChevronLeft size={16} />
          Back
        </button>
        <div className="breadcrumb" aria-label="Current folder">
          <Home size={15} />
          <span>{folderStack.map((folder) => folder.name).join(' / ')}</span>
        </div>
        <button className="primary-button compact" type="button" onClick={() => selectVault(currentFolder)}>
          Use this folder
        </button>
      </div>

      {isLoading && <p className="muted-text">Loading folders...</p>}
      {error && <p className="error-text">{error}</p>}

      {!isLoading && !error && (
        <div className="folder-list">
          {sortedFolders.length === 0 ? (
            <p className="empty-state">No subfolders found.</p>
          ) : (
            sortedFolders.map((folder) => (
              <button className="folder-row" key={folder.id} type="button" onClick={() => openFolder(folder)}>
                <Folder size={18} />
                <span>{folder.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
