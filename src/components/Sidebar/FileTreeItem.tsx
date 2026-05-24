import { ChevronRight, FileText, Folder } from 'lucide-react';
import { useState } from 'react';
import { useVault } from '../../contexts/VaultContext';
import { VaultNode } from '../../types/vault';
import { FileTree } from './FileTree';

export function FileTreeItem({ node }: { node: VaultNode }) {
  const { selectFile, selectedFile } = useVault();
  const [isOpen, setIsOpen] = useState(false);
  const isFolder = node.type === 'folder';
  const isSelected = selectedFile?.id === node.id;

  function handleClick() {
    if (isFolder) {
      setIsOpen((current) => !current);
      return;
    }

    if (node.type === 'markdown') {
      selectFile(node);
    }
  }

  return (
    <li>
      <button
        className={`tree-item ${isSelected ? 'selected' : ''}`}
        type="button"
        onClick={handleClick}
        disabled={node.type === 'other'}
      >
        {isFolder ? (
          <ChevronRight className={isOpen ? 'chevron open' : 'chevron'} size={14} />
        ) : (
          <span className="tree-spacer" />
        )}
        {isFolder ? <Folder size={16} /> : <FileText size={16} />}
        <span>{node.name}</span>
      </button>
      {isFolder && isOpen && node.children && <FileTree nodes={node.children} />}
    </li>
  );
}
