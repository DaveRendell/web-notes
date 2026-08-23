import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import {
  ChevronRight,
  EllipsisVertical,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  Pencil,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useVault } from '../../contexts/VaultContext';
import { getVaultNodeDisplayName } from '../../lib/vaultTree';
import { VaultNode } from '../../types/vault';
import { FileTreeList } from './FileTree';
import {
  getVaultDragData,
  getVaultDragNodeId,
  getVaultDropData,
  useFileTreeDnd,
} from './FileTreeDndContext';

export function FileTreeItem({ node }: { node: VaultNode }) {
  const {
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    favoriteNoteIds,
    isOnline,
    noteIcons,
    renameFolder,
    renameNote,
    selectFile,
    selectedFile,
    toggleFavorite,
  } = useVault();
  const {
    activeNodeId,
    canMoveTo,
    dropTargetId,
    expandedFolderIds,
    isMoving,
    openMoveDialog,
    setFolderExpanded,
  } = useFileTreeDnd();
  const rowRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isFolder = node.type === 'folder';
  const isMovable = isFolder || node.type === 'markdown';
  const isOpen = isFolder && expandedFolderIds.has(node.id);
  const isSelected = selectedFile?.id === node.id;
  const nodeIsMoving = isMoving(node.id);
  const isDropTarget = dropTargetId === node.id;
  const isInvalidTarget = Boolean(isFolder && activeNodeId && !canMoveTo(activeNodeId, node.id));
  const displayName = getVaultNodeDisplayName(node);
  const noteEmoji = node.type === 'markdown' ? noteIcons[node.id] : null;
  const isFavorite = favoriteNoteIds.includes(node.id);

  useEffect(() => {
    const element = rowRef.current;
    const dragHandle = dragHandleRef.current;
    if (!element || !dragHandle || !isMovable) return;

    return draggable({
      element,
      dragHandle,
      canDrag: () => isOnline && !nodeIsMoving,
      getInitialData: () => getVaultDragData(node.id),
    });
  }, [isMovable, isOnline, node.id, nodeIsMoving]);

  useEffect(() => {
    const element = rowRef.current;
    if (!element || !isFolder) return;

    return dropTargetForElements({
      element,
      getData: () => getVaultDropData(node.id),
      canDrop: ({ source }) => {
        const sourceId = getVaultDragNodeId(source.data);
        return Boolean(sourceId && canMoveTo(sourceId, node.id));
      },
    });
  }, [canMoveTo, isFolder, node.id]);

  useEffect(() => {
    if (!isMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  function handleClick() {
    if (isFolder) {
      setFolderExpanded(node.id, !isOpen);
      return;
    }

    if (node.type === 'markdown') {
      selectFile(node);
    }
  }

  async function handleCreateChildFolder() {
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;

    try {
      await createFolder(node, name);
      setFolderExpanded(node.id, true);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to create folder.');
    }
  }

  async function handleCreateChildNote() {
    const name = window.prompt('New note name');
    if (!name?.trim()) return;

    try {
      const createdNote = await createNote(node, name);
      setFolderExpanded(node.id, true);
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

  async function handleRenameFolder() {
    const name = window.prompt('Rename folder', node.name);
    if (!name?.trim() || name.trim() === node.name) return;

    try {
      await renameFolder(node, name);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to rename folder.');
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

  async function handleDeleteFolder() {
    if (!window.confirm(`Delete ${node.name} and everything inside it?`)) return;

    try {
      await deleteFolder(node);
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : 'Failed to delete folder.');
    }
  }

  function runMenuAction(action: () => Promise<void>) {
    setIsMenuOpen(false);
    void action();
  }

  return (
    <li>
      <div
        ref={rowRef}
        className={`tree-row ${isSelected ? 'selected' : ''} ${activeNodeId === node.id ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''} ${isInvalidTarget ? 'invalid-drop-target' : ''}`}
      >
        {isMovable ? (
          <button
            ref={dragHandleRef}
            className="tree-drag-handle"
            type="button"
            disabled={!isOnline || nodeIsMoving}
            onClick={(event) => openMoveDialog(node.id, event.currentTarget)}
            aria-label={`Move ${displayName}`}
            title={isOnline ? `Drag or choose where to move ${displayName}` : 'Reconnect to the internet to move files'}
          >
            <GripVertical size={14} />
          </button>
        ) : (
          <span className="tree-drag-placeholder" />
        )}
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
          {isFolder ? (
            <Folder size={16} />
          ) : noteEmoji ? (
            <span className="note-emoji" aria-hidden="true">{noteEmoji}</span>
          ) : (
            <FileText size={16} />
          )}
          <span>{displayName}</span>
        </button>
        {isMovable && (
          <div className="tree-actions" ref={menuRef}>
            <button
              className="tree-action"
              type="button"
              onClick={() => setIsMenuOpen((current) => !current)}
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              aria-label={`Actions for ${displayName}`}
              title={`Actions for ${displayName}`}
            >
              <EllipsisVertical size={14} />
            </button>
            {isMenuOpen && (
              <div className="tree-action-menu" role="menu">
                {isFolder && (
                  <>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(handleCreateChildNote)} disabled={!isOnline}>
                      <FilePlus2 size={14} />
                      <span>New note</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(handleCreateChildFolder)} disabled={!isOnline}>
                      <FolderPlus size={14} />
                      <span>New folder</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(handleRenameFolder)} disabled={!isOnline}>
                      <Pencil size={14} />
                      <span>Rename</span>
                    </button>
                    <button className="danger" type="button" role="menuitem" onClick={() => runMenuAction(handleDeleteFolder)} disabled={!isOnline}>
                      <Trash2 size={14} />
                      <span>Delete folder</span>
                    </button>
                  </>
                )}
                {node.type === 'markdown' && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsMenuOpen(false);
                        toggleFavorite(node.id);
                      }}
                    >
                      {isFavorite ? <StarOff size={14} /> : <Star size={14} />}
                      <span>{isFavorite ? 'Remove favourite' : 'Add favourite'}</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(handleRenameNote)} disabled={!isOnline}>
                      <Pencil size={14} />
                      <span>Rename</span>
                    </button>
                    <button className="danger" type="button" role="menuitem" onClick={() => runMenuAction(handleDeleteNote)} disabled={!isOnline}>
                      <Trash2 size={14} />
                      <span>Delete note</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {isFolder && isOpen && node.children && <FileTreeList nodes={node.children} />}
    </li>
  );
}
