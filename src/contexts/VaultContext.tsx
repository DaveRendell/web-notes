import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useVaultTree } from '../hooks/useVaultTree';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  createDriveFolder,
  createDriveMarkdownFile,
  deleteDriveFile,
  moveDriveFile,
  renameDriveFolder,
  renameDriveFile,
} from '../lib/googleDrive';
import {
  deleteNoteContent,
  getNoteIcons,
  putNoteContent,
  putNoteIcon,
  updateNoteContentVersion,
} from '../lib/vaultCache';
import { findLeadingEmoji } from '../lib/markdown';
import {
  containsVaultNode,
  createVaultNode,
  findVaultNode,
  findVaultNodeParentId,
  sortVaultNodes,
} from '../lib/vaultTree';
import { DriveFile } from '../types/drive';
import { VaultNode } from '../types/vault';
import { useAuth } from './AuthContext';

const SELECTED_VAULT_KEY = 'vault-web-viewer:selected-vault';
const RECENT_NOTES_KEY = 'vault-web-viewer:recent-notes';
const FAVORITE_NOTES_KEY = 'vault-web-viewer:favorite-notes';
const MAX_RECENT_NOTES = 25;

type StoredVault = {
  id: string;
  name: string;
};

type VaultContextValue = {
  cacheNoteIcon: (fileId: string, content: string) => void;
  clearVault: () => void;
  createFolder: (parentFolder: VaultNode | null, name: string) => Promise<VaultNode>;
  createNote: (parentFolder: VaultNode | null, name: string) => Promise<VaultNode>;
  deleteFolder: (folder: VaultNode) => Promise<void>;
  deleteNote: (note: VaultNode) => Promise<void>;
  error: string | null;
  favoriteNotes: VaultNode[];
  favoriteNoteIds: string[];
  isLoading: boolean;
  isOnline: boolean;
  isRefreshing: boolean;
  moveNode: (node: VaultNode, destinationFolder: VaultNode | null) => Promise<VaultNode>;
  noteIcons: Record<string, string | null>;
  notes: VaultNode[];
  recentNotes: VaultNode[];
  reorderFavorite: (noteId: string, targetNoteId: string, placement: 'before' | 'after') => void;
  refreshError: string | null;
  renameFolder: (folder: VaultNode, name: string) => Promise<VaultNode>;
  renameNote: (note: VaultNode, name: string) => Promise<VaultNode>;
  resolveWikilink: (target: string) => VaultNode | null;
  selectFile: (file: VaultNode) => void;
  selectVault: (folder: Pick<DriveFile, 'id' | 'name'>) => void;
  selectedFile: VaultNode | null;
  selectedVault: StoredVault | null;
  storeSavedNote: (note: VaultNode, file: DriveFile, content: string) => void;
  toggleFavorite: (noteId: string) => void;
  tree: VaultNode[];
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { accessToken, accountId, ensureAccessToken, isAccountResolved } = useAuth();
  const [selectedVault, setSelectedVault] = useState<StoredVault | null>(() => readStoredVault());
  const [selectedFile, setSelectedFile] = useState<VaultNode | null>(null);
  const [recentNoteIds, setRecentNoteIds] = useState<string[]>(() => readRecentNoteIds(selectedVault?.id ?? null));
  const [favoriteNoteIds, setFavoriteNoteIds] = useState<string[]>(() => readFavoriteNoteIds(selectedVault?.id ?? null));
  const [routePath, setRoutePath] = useState(() => getNotePathFromHash());
  const [noteIcons, setNoteIcons] = useState<Record<string, string | null>>({});
  const isOnline = useOnlineStatus();
  const { error, isLoading, isRefreshing, refreshError, setTree, tree } = useVaultTree(
    accessToken,
    accountId,
    isAccountResolved,
    selectedVault?.id ?? null,
    selectedVault?.name ?? null,
  );
  const notes = useMemo(() => flattenVaultTree(tree).filter((node) => node.type === 'markdown'), [tree]);
  const recentNotes = useMemo(() => {
    const notesById = new Map(notes.map((note) => [note.id, note]));
    return recentNoteIds.flatMap((id) => {
      const note = notesById.get(id);
      return note ? [note] : [];
    });
  }, [notes, recentNoteIds]);
  const favoriteNotes = useMemo(() => {
    const notesById = new Map(notes.map((note) => [note.id, note]));
    return favoriteNoteIds.flatMap((id) => {
      const note = notesById.get(id);
      return note ? [note] : [];
    });
  }, [favoriteNoteIds, notes]);
  const vaultIndex = useMemo(() => createVaultIndex(tree), [tree]);

  const selectVault = useCallback((folder: Pick<DriveFile, 'id' | 'name'>) => {
    const vault = { id: folder.id, name: folder.name };
    localStorage.setItem(SELECTED_VAULT_KEY, JSON.stringify(vault));
    setSelectedVault(vault);
    setSelectedFile(null);
    setRecentNoteIds(readRecentNoteIds(vault.id));
    setFavoriteNoteIds(readFavoriteNoteIds(vault.id));
    setRoutePath(null);
    clearNoteHash();
  }, []);

  const clearVault = useCallback(() => {
    localStorage.removeItem(SELECTED_VAULT_KEY);
    setSelectedVault(null);
    setSelectedFile(null);
    setRecentNoteIds([]);
    setFavoriteNoteIds([]);
    setRoutePath(null);
    clearNoteHash();
  }, []);

  const cacheNoteIcon = useCallback(
    (fileId: string, content: string) => {
      if (!accountId || !selectedVault) return;

      const emoji = findLeadingEmoji(content);
      setNoteIcons((currentIcons) => {
        if (Object.hasOwn(currentIcons, fileId) && currentIcons[fileId] === emoji) return currentIcons;
        return { ...currentIcons, [fileId]: emoji };
      });
      void putNoteIcon({
        accountId,
        vaultId: selectedVault.id,
        fileId,
        emoji,
        cachedAt: Date.now(),
      });
    },
    [accountId, selectedVault],
  );

  const selectFile = useCallback((file: VaultNode) => {
    setSelectedFile(file);
    setRoutePath(file.path);
    setNoteHash(file.path);
  }, []);

  const toggleFavorite = useCallback(
    (noteId: string) => {
      if (!selectedVault) return;

      setFavoriteNoteIds((currentIds) => {
        const nextIds = currentIds.includes(noteId)
          ? currentIds.filter((id) => id !== noteId)
          : [...currentIds, noteId];
        writeFavoriteNoteIds(selectedVault.id, nextIds);
        return nextIds;
      });
    },
    [selectedVault],
  );

  const reorderFavorite = useCallback(
    (noteId: string, targetNoteId: string, placement: 'before' | 'after') => {
      if (!selectedVault || noteId === targetNoteId) return;

      setFavoriteNoteIds((currentIds) => {
        if (!currentIds.includes(noteId) || !currentIds.includes(targetNoteId)) return currentIds;

        const nextIds = currentIds.filter((id) => id !== noteId);
        const targetIndex = nextIds.indexOf(targetNoteId);
        nextIds.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, noteId);
        writeFavoriteNoteIds(selectedVault.id, nextIds);
        return nextIds;
      });
    },
    [selectedVault],
  );

  const resolveWikilink = useCallback(
    (target: string) => {
      const normalizedTarget = normalizeWikilinkTarget(target);
      return vaultIndex.byPath.get(normalizedTarget) ?? vaultIndex.byName.get(normalizedTarget) ?? null;
    },
    [vaultIndex],
  );

  const createNote = useCallback(
    async (parentFolder: VaultNode | null, name: string) => {
      if (!accessToken || !selectedVault) {
        throw new Error('Sign in and choose a vault before creating notes.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before creating a note.');

      const parentFolderId = parentFolder?.id ?? selectedVault.id;
      const parentPath = parentFolder?.path ?? '';
      const validAccessToken = await ensureAccessToken();
      const file = await createDriveMarkdownFile(validAccessToken, parentFolderId, name);
      const node = createVaultNode(file, parentPath);

      setTree((currentTree) => addNodeToTree(currentTree, parentFolder?.id ?? null, node));
      if (accountId) {
        void putNoteContent({
          accountId,
          vaultId: selectedVault.id,
          fileId: node.id,
          content: '',
          modifiedTime: file.modifiedTime,
          cachedAt: Date.now(),
        });
      }
      selectFile(node);
      return node;
    },
    [accessToken, accountId, ensureAccessToken, isOnline, selectFile, selectedVault, setTree],
  );

  const createFolder = useCallback(
    async (parentFolder: VaultNode | null, name: string) => {
      if (!accessToken || !selectedVault) {
        throw new Error('Sign in and choose a vault before creating folders.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before creating a folder.');
      if (parentFolder && parentFolder.type !== 'folder') {
        throw new Error('Folders can only be created inside another folder or at the vault root.');
      }

      const parentFolderId = parentFolder?.id ?? selectedVault.id;
      const parentPath = parentFolder?.path ?? '';
      const validAccessToken = await ensureAccessToken();
      const file = await createDriveFolder(validAccessToken, parentFolderId, name);
      const node = createVaultNode(file, parentPath);

      setTree((currentTree) => addNodeToTree(currentTree, parentFolder?.id ?? null, node));
      return node;
    },
    [accessToken, ensureAccessToken, isOnline, selectedVault, setTree],
  );

  const renameNote = useCallback(
    async (note: VaultNode, name: string) => {
      if (!accessToken) {
        throw new Error('Sign in before renaming notes.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before renaming a note.');

      const validAccessToken = await ensureAccessToken();
      const file = await renameDriveFile(validAccessToken, note.id, name);
      const parentPath = getParentPath(note.path);
      const updatedNote = createVaultNode(file, parentPath);

      setTree((currentTree) => replaceNodeInTree(currentTree, updatedNote));
      if (accountId && selectedVault) {
        void updateNoteContentVersion(accountId, selectedVault.id, note.id, file.modifiedTime);
      }

      if (selectedFile?.id === note.id) {
        selectFile(updatedNote);
      }

      return updatedNote;
    },
    [accessToken, accountId, ensureAccessToken, isOnline, selectFile, selectedFile?.id, selectedVault, setTree],
  );

  const renameFolder = useCallback(
    async (folder: VaultNode, name: string) => {
      if (!accessToken) throw new Error('Sign in before renaming folders.');
      if (!isOnline) throw new Error('Reconnect to the internet before renaming a folder.');
      if (folder.type !== 'folder') throw new Error('Only folders can be renamed with this action.');

      const currentFolder = findVaultNode(tree, folder.id);
      if (currentFolder?.type !== 'folder') throw new Error('This folder is no longer in the current vault.');

      const validAccessToken = await ensureAccessToken();
      const file = await renameDriveFolder(validAccessToken, currentFolder.id, name);
      const updatedFolder = rebaseMovedNode(currentFolder, file, getParentPath(currentFolder.path));
      setTree((currentTree) => replaceNodeInTree(currentTree, updatedFolder));
      return updatedFolder;
    },
    [accessToken, ensureAccessToken, isOnline, setTree, tree],
  );

  const deleteNote = useCallback(
    async (note: VaultNode) => {
      if (!accessToken) {
        throw new Error('Sign in before deleting notes.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before deleting a note.');

      const validAccessToken = await ensureAccessToken();
      await deleteDriveFile(validAccessToken, note.id);
      setTree((currentTree) => removeNodeFromTree(currentTree, note.id));
      if (accountId && selectedVault) {
        void deleteNoteContent(accountId, selectedVault.id, note.id);
      }
      setRecentNoteIds((currentIds) => {
        const nextIds = currentIds.filter((id) => id !== note.id);
        writeRecentNoteIds(selectedVault?.id ?? null, nextIds);
        return nextIds;
      });
      setFavoriteNoteIds((currentIds) => {
        const nextIds = currentIds.filter((id) => id !== note.id);
        writeFavoriteNoteIds(selectedVault?.id ?? null, nextIds);
        return nextIds;
      });
      setNoteIcons((currentIcons) => {
        const nextIcons = { ...currentIcons };
        delete nextIcons[note.id];
        return nextIcons;
      });

      if (selectedFile?.id === note.id) {
        setSelectedFile(null);
        setRoutePath(null);
        clearNoteHash();
      }
    },
    [accessToken, accountId, ensureAccessToken, isOnline, selectedFile?.id, selectedVault, setTree],
  );

  const deleteFolder = useCallback(
    async (folder: VaultNode) => {
      if (!accessToken) throw new Error('Sign in before deleting folders.');
      if (!isOnline) throw new Error('Reconnect to the internet before deleting a folder.');

      const currentFolder = findVaultNode(tree, folder.id);
      if (currentFolder?.type !== 'folder') throw new Error('This folder is no longer in the current vault.');

      const removedNoteIds = new Set(
        flattenVaultTree([currentFolder])
          .filter((node) => node.type === 'markdown')
          .map((node) => node.id),
      );
      const validAccessToken = await ensureAccessToken();
      await deleteDriveFile(validAccessToken, currentFolder.id);
      setTree((currentTree) => removeNodeFromTree(currentTree, currentFolder.id));

      if (accountId && selectedVault) {
        for (const noteId of removedNoteIds) {
          void deleteNoteContent(accountId, selectedVault.id, noteId);
        }
      }
      setRecentNoteIds((currentIds) => {
        const nextIds = currentIds.filter((id) => !removedNoteIds.has(id));
        writeRecentNoteIds(selectedVault?.id ?? null, nextIds);
        return nextIds;
      });
      setFavoriteNoteIds((currentIds) => {
        const nextIds = currentIds.filter((id) => !removedNoteIds.has(id));
        writeFavoriteNoteIds(selectedVault?.id ?? null, nextIds);
        return nextIds;
      });
      setNoteIcons((currentIcons) => {
        const nextIcons = { ...currentIcons };
        for (const noteId of removedNoteIds) delete nextIcons[noteId];
        return nextIcons;
      });

      if (selectedFile && removedNoteIds.has(selectedFile.id)) {
        setSelectedFile(null);
        setRoutePath(null);
        clearNoteHash();
      }
    },
    [accessToken, accountId, ensureAccessToken, isOnline, selectedFile, selectedVault, setTree, tree],
  );

  const moveNode = useCallback(
    async (node: VaultNode, destinationFolder: VaultNode | null) => {
      if (!accessToken || !selectedVault) {
        throw new Error('Sign in and choose a vault before moving files.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before moving a file.');
      if (node.type !== 'markdown' && node.type !== 'folder') {
        throw new Error('Only notes and folders can be moved.');
      }

      const currentNode = findVaultNode(tree, node.id);
      if (!currentNode) throw new Error('This file is no longer in the current vault.');
      if (currentNode.type !== 'markdown' && currentNode.type !== 'folder') {
        throw new Error('Only notes and folders can be moved.');
      }

      const currentDestination = destinationFolder ? findVaultNode(tree, destinationFolder.id) : null;
      if (destinationFolder && currentDestination?.type !== 'folder') {
        throw new Error('Files can only be moved into folders or the vault root.');
      }
      if (currentDestination?.id === currentNode.id) {
        throw new Error('A folder cannot be moved into itself.');
      }
      if (currentNode.type === 'folder' && currentDestination && containsVaultNode(currentNode, currentDestination.id)) {
        throw new Error('A folder cannot be moved into one of its descendants.');
      }

      const currentParentId = findVaultNodeParentId(tree, currentNode.id);
      const destinationParentId = currentDestination?.id ?? null;
      if (currentParentId === destinationParentId) {
        return currentNode;
      }

      const oldDriveParentId = currentParentId ?? selectedVault.id;
      const newDriveParentId = destinationParentId ?? selectedVault.id;
      const currentParentPath = currentParentId ? findVaultNode(tree, currentParentId)?.path ?? '' : '';
      const destinationPath = currentDestination?.path ?? '';
      const optimisticFile = { ...currentNode.source, parents: [newDriveParentId] };
      setTree((currentTree) =>
        addNodeToTree(
          removeNodeFromTree(currentTree, currentNode.id),
          destinationParentId,
          rebaseMovedNode(findVaultNode(currentTree, currentNode.id) ?? currentNode, optimisticFile, destinationPath),
        ),
      );

      try {
        const validAccessToken = await ensureAccessToken();
        const file = await moveDriveFile(
          validAccessToken,
          currentNode.id,
          oldDriveParentId,
          newDriveParentId,
        );
        const movedNode = rebaseMovedNode(currentNode, file, destinationPath);

        setTree((currentTree) => {
          const liveNode = findVaultNode(currentTree, currentNode.id);
          return liveNode ? replaceNodeInTree(currentTree, rebaseMovedNode(liveNode, file, destinationPath)) : currentTree;
        });
        if (currentNode.type === 'markdown' && accountId) {
          void updateNoteContentVersion(accountId, selectedVault.id, currentNode.id, file.modifiedTime);
        }

        return movedNode;
      } catch (requestError) {
        setTree((currentTree) => {
          const liveNode = findVaultNode(currentTree, currentNode.id);
          if (!liveNode) return currentTree;

          const restoredFile = {
            ...liveNode.source,
            parents: currentNode.source.parents ?? [oldDriveParentId],
          };
          const restoredNode = rebaseMovedNode(liveNode, restoredFile, currentParentPath);
          return addNodeToTree(removeNodeFromTree(currentTree, currentNode.id), currentParentId, restoredNode);
        });
        throw requestError;
      }
    },
    [accessToken, accountId, ensureAccessToken, isOnline, selectedVault, setTree, tree],
  );

  const storeSavedNote = useCallback(
    (note: VaultNode, file: DriveFile, nextContent: string) => {
      const updatedNote = createVaultNode(file, getParentPath(note.path));
      setTree((currentTree) => replaceNodeInTree(currentTree, updatedNote));

      if (selectedFile?.id === note.id) {
        setSelectedFile(updatedNote);
      }

      if (accountId && selectedVault) {
        void putNoteContent({
          accountId,
          vaultId: selectedVault.id,
          fileId: note.id,
          content: nextContent,
          modifiedTime: file.modifiedTime,
          cachedAt: Date.now(),
        });
      }
    },
    [accountId, selectedFile?.id, selectedVault, setTree],
  );

  useEffect(() => {
    let cancelled = false;
    setNoteIcons({});

    if (accountId && selectedVault) {
      void getNoteIcons(accountId, selectedVault.id).then((records) => {
        if (cancelled) return;

        const cachedIcons = Object.fromEntries(records.map((record) => [record.fileId, record.emoji]));
        setNoteIcons((currentIcons) => ({ ...cachedIcons, ...currentIcons }));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [accountId, selectedVault]);

  useEffect(() => {
    if (!selectedVault || selectedFile?.type !== 'markdown') return;

    setRecentNoteIds((currentIds) => {
      if (currentIds[0] === selectedFile.id) return currentIds;

      const nextIds = [selectedFile.id, ...currentIds.filter((id) => id !== selectedFile.id)].slice(
        0,
        MAX_RECENT_NOTES,
      );
      writeRecentNoteIds(selectedVault.id, nextIds);
      return nextIds;
    });
  }, [selectedFile, selectedVault]);

  useEffect(() => {
    if (!routePath) {
      if (selectedFile) {
        setSelectedFile(null);
      }
      return;
    }

    const currentNote = selectedFile
      ? vaultIndex.byId.get(selectedFile.id)
      : vaultIndex.byPath.get(normalizeWikilinkTarget(routePath));

    if (!currentNote) {
      if (selectedFile && !isLoading && !isRefreshing) {
        setSelectedFile(null);
        setRoutePath(null);
        clearNoteHash();
      }
      return;
    }

    if (currentNote === selectedFile) return;

    setSelectedFile(currentNote);
    if (currentNote.path !== routePath) {
      setRoutePath(currentNote.path);
      replaceNoteHash(currentNote.path);
    }
  }, [isLoading, isRefreshing, routePath, selectedFile, vaultIndex]);

  useEffect(() => {
    function handleHashChange() {
      setRoutePath(getNotePathFromHash());
    }

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  useEffect(() => {
    document.title = selectedFile ? `${stripMarkdownExtension(selectedFile.name)} - Vault Web Viewer` : 'Vault Web Viewer';
  }, [selectedFile]);

  const value = useMemo(
    () => ({
      cacheNoteIcon,
      clearVault,
      createFolder,
      createNote,
      deleteFolder,
      deleteNote,
      error,
      favoriteNoteIds,
      favoriteNotes,
      isLoading,
      isOnline,
      isRefreshing,
      moveNode,
      noteIcons,
      notes,
      recentNotes,
      reorderFavorite,
      refreshError,
      renameFolder,
      renameNote,
      resolveWikilink,
      selectFile,
      selectVault,
      selectedFile,
      selectedVault,
      storeSavedNote,
      toggleFavorite,
      tree,
    }),
    [
      clearVault,
      cacheNoteIcon,
      createFolder,
      createNote,
      deleteFolder,
      deleteNote,
      error,
      favoriteNoteIds,
      favoriteNotes,
      isLoading,
      isOnline,
      isRefreshing,
      moveNode,
      noteIcons,
      notes,
      recentNotes,
      reorderFavorite,
      refreshError,
      renameFolder,
      renameNote,
      resolveWikilink,
      selectFile,
      selectVault,
      selectedFile,
      selectedVault,
      storeSavedNote,
      toggleFavorite,
      tree,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

type VaultIndex = {
  byId: Map<string, VaultNode>;
  byName: Map<string, VaultNode>;
  byPath: Map<string, VaultNode>;
};

function createVaultIndex(nodes: VaultNode[]): VaultIndex {
  const index: VaultIndex = {
    byId: new Map(),
    byName: new Map(),
    byPath: new Map(),
  };

  for (const node of flattenVaultTree(nodes)) {
    if (node.type !== 'markdown') continue;

    index.byId.set(node.id, node);
    index.byPath.set(normalizeWikilinkTarget(node.path), node);
    index.byName.set(normalizeWikilinkTarget(node.name), node);
  }

  return index;
}

function flattenVaultTree(nodes: VaultNode[]): VaultNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenVaultTree(node.children) : [])]);
}

function normalizeWikilinkTarget(target: string) {
  const trimmedTarget = target.trim().replace(/^\/+/, '');
  return trimmedTarget.toLowerCase().endsWith('.md') ? trimmedTarget : `${trimmedTarget}.md`;
}

function addNodeToTree(nodes: VaultNode[], parentFolderId: string | null, node: VaultNode): VaultNode[] {
  if (!parentFolderId) {
    return sortVaultNodes([...nodes, node]);
  }

  return nodes.map((currentNode) => {
    if (currentNode.id === parentFolderId) {
      return {
        ...currentNode,
        children: sortVaultNodes([...(currentNode.children ?? []), node]),
      };
    }

    if (currentNode.children) {
      return {
        ...currentNode,
        children: addNodeToTree(currentNode.children, parentFolderId, node),
      };
    }

    return currentNode;
  });
}

function replaceNodeInTree(nodes: VaultNode[], replacement: VaultNode): VaultNode[] {
  return sortVaultNodes(
    nodes.map((node) => {
      if (node.id === replacement.id) {
        return replacement;
      }

      if (node.children) {
        return {
          ...node,
          children: replaceNodeInTree(node.children, replacement),
        };
      }

      return node;
    }),
  );
}

function removeNodeFromTree(nodes: VaultNode[], nodeId: string): VaultNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      if (!node.children) return node;

      return {
        ...node,
        children: removeNodeFromTree(node.children, nodeId),
      };
    });
}

function rebaseMovedNode(node: VaultNode, file: DriveFile, destinationPath: string): VaultNode {
  const movedNode = createVaultNode(file, destinationPath);

  if (node.type !== 'folder') return movedNode;

  return {
    ...movedNode,
    children: node.children?.map((child) => rebaseDescendantPath(child, movedNode.path)) ?? [],
  };
}

function rebaseDescendantPath(node: VaultNode, parentPath: string): VaultNode {
  const path = `${parentPath}/${node.name}`;
  return {
    ...node,
    path,
    children: node.children?.map((child) => rebaseDescendantPath(child, path)),
  };
}

function getParentPath(path: string) {
  return path.split('/').slice(0, -1).join('/');
}

function stripMarkdownExtension(name: string) {
  return name.replace(/\.md$/i, '');
}

function getNotePathFromHash() {
  const hash = window.location.hash;
  const routePrefix = '#/note/';

  if (!hash.startsWith(routePrefix)) {
    return null;
  }

  try {
    return decodeURIComponent(hash.slice(routePrefix.length));
  } catch {
    return null;
  }
}

function setNoteHash(path: string) {
  const nextHash = `#/note/${encodeURIComponent(path)}`;

  if (window.location.hash === nextHash) return;

  window.history.pushState(null, '', nextHash);
}

function replaceNoteHash(path: string) {
  window.history.replaceState(null, '', `#/note/${encodeURIComponent(path)}`);
}

function clearNoteHash() {
  if (!window.location.hash.startsWith('#/note/')) return;

  window.history.pushState(null, '', window.location.pathname + window.location.search);
}

export function useVault() {
  const context = useContext(VaultContext);

  if (!context) {
    throw new Error('useVault must be used inside VaultProvider.');
  }

  return context;
}

function readStoredVault(): StoredVault | null {
  const storedValue = localStorage.getItem(SELECTED_VAULT_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as StoredVault;
  } catch {
    localStorage.removeItem(SELECTED_VAULT_KEY);
    return null;
  }
}

function readRecentNoteIds(vaultId: string | null): string[] {
  if (!vaultId) return [];

  try {
    const storedValue = localStorage.getItem(RECENT_NOTES_KEY);
    if (!storedValue) return [];

    const recentNotesByVault = JSON.parse(storedValue) as Record<string, unknown>;
    const storedIds = recentNotesByVault[vaultId];

    return Array.isArray(storedIds)
      ? storedIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT_NOTES)
      : [];
  } catch {
    localStorage.removeItem(RECENT_NOTES_KEY);
    return [];
  }
}

function writeRecentNoteIds(vaultId: string | null, noteIds: string[]) {
  if (!vaultId) return;

  let recentNotesByVault: Record<string, string[]> = {};

  try {
    const storedValue = localStorage.getItem(RECENT_NOTES_KEY);
    if (storedValue) {
      const parsedValue = JSON.parse(storedValue) as unknown;
      if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
        recentNotesByVault = parsedValue as Record<string, string[]>;
      }
    }
  } catch {
    // Replace malformed local data with the current vault's valid history.
  }

  recentNotesByVault[vaultId] = noteIds.slice(0, MAX_RECENT_NOTES);
  localStorage.setItem(RECENT_NOTES_KEY, JSON.stringify(recentNotesByVault));
}

function readFavoriteNoteIds(vaultId: string | null): string[] {
  if (!vaultId) return [];

  try {
    const storedValue = localStorage.getItem(FAVORITE_NOTES_KEY);
    if (!storedValue) return [];

    const favoriteNotesByVault = JSON.parse(storedValue) as Record<string, unknown>;
    const storedIds = favoriteNotesByVault[vaultId];
    return Array.isArray(storedIds)
      ? storedIds.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    localStorage.removeItem(FAVORITE_NOTES_KEY);
    return [];
  }
}

function writeFavoriteNoteIds(vaultId: string | null, noteIds: string[]) {
  if (!vaultId) return;

  let favoriteNotesByVault: Record<string, string[]> = {};

  try {
    const storedValue = localStorage.getItem(FAVORITE_NOTES_KEY);
    if (storedValue) {
      const parsedValue = JSON.parse(storedValue) as unknown;
      if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
        favoriteNotesByVault = parsedValue as Record<string, string[]>;
      }
    }
  } catch {
    // Replace malformed local data with the current vault's valid favourites.
  }

  favoriteNotesByVault[vaultId] = noteIds;
  localStorage.setItem(FAVORITE_NOTES_KEY, JSON.stringify(favoriteNotesByVault));
}
