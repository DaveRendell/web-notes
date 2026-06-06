import { ChevronRight, FilePlus2, FileText, Folder, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useVault } from '../../contexts/VaultContext';
import { VaultNode } from '../../types/vault';
import { FileTree } from './FileTree';

export function FileTreeItem({ node }: { node: VaultNode }) {
  const { createNote, deleteNote, renameNote, selectFile, selectedFile } = useVault();
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

  async function handleCreateChildNote() {
    const name = window.prompt('New note name');
    if (!name?.trim()) return;

    try {
      const createdNote = await createNote(node, name);
      setIsOpen(true);
      selectFile(createdNote);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to create note.');
    }
  }

  async function handleRenameNote() {
    const name = window.prompt('Rename note', node.name);
    if (!name?.trim() || name.trim() === node.name) return;

    try {
      await renameNote(node, name);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to rename note.');
    }
  }

  async function handleDeleteNote() {
    if (!window.confirm(`Delete ${node.name}?`)) return;

    try {
      await deleteNote(node);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to delete note.');
    }
  }

  return (
    <li>
      <div className={`tree-row ${isSelected ? 'selected' : ''}`}>
        <button
          className="tree-item"
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
        {isFolder && (
          <button
            className="tree-action"
            type="button"
            onClick={handleCreateChildNote}
            aria-label={`Add note in ${node.name}`}
            title={`Add note in ${node.name}`}
          >
            <FilePlus2 size={14} />
          </button>
        )}
        {node.type === 'markdown' && (
          <>
            <button
              className="tree-action"
              type="button"
              onClick={handleRenameNote}
              aria-label={`Rename ${node.name}`}
              title={`Rename ${node.name}`}
            >
              <Pencil size={14} />
            </button>
            <button
              className="tree-action danger"
              type="button"
              onClick={handleDeleteNote}
              aria-label={`Delete ${node.name}`}
              title={`Delete ${node.name}`}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      {isFolder && isOpen && node.children && <FileTree nodes={node.children} />}
    </li>
  );
}
