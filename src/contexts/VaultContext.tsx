import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useVaultTree } from '../hooks/useVaultTree';
import { createDriveMarkdownFile, deleteDriveFile, renameDriveFile } from '../lib/googleDrive';
import { createVaultNode, sortVaultNodes } from '../lib/vaultTree';
import { DriveFile } from '../types/drive';
import { VaultNode } from '../types/vault';
import { useAuth } from './AuthContext';

const SELECTED_VAULT_KEY = 'vault-web-viewer:selected-vault';
const RECENT_NOTES_KEY = 'vault-web-viewer:recent-notes';
const MAX_RECENT_NOTES = 25;

type StoredVault = {
  id: string;
  name: string;
};

type VaultContextValue = {
  clearVault: () => void;
  createNote: (parentFolder: VaultNode | null, name: string) => Promise<VaultNode>;
  deleteNote: (note: VaultNode) => Promise<void>;
  error: string | null;
  isLoading: boolean;
  notes: VaultNode[];
  recentNotes: VaultNode[];
  renameNote: (note: VaultNode, name: string) => Promise<VaultNode>;
  resolveWikilink: (target: string) => VaultNode | null;
  selectFile: (file: VaultNode) => void;
  selectVault: (folder: Pick<DriveFile, 'id' | 'name'>) => void;
  selectedFile: VaultNode | null;
  selectedVault: StoredVault | null;
  tree: VaultNode[];
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const [selectedVault, setSelectedVault] = useState<StoredVault | null>(() => readStoredVault());
  const [selectedFile, setSelectedFile] = useState<VaultNode | null>(null);
  const [recentNoteIds, setRecentNoteIds] = useState<string[]>(() => readRecentNoteIds(selectedVault?.id ?? null));
  const [routePath, setRoutePath] = useState(() => getNotePathFromHash());
  const { error, isLoading, setTree, tree } = useVaultTree(accessToken, selectedVault?.id ?? null);
  const notes = useMemo(() => flattenVaultTree(tree).filter((node) => node.type === 'markdown'), [tree]);
  const recentNotes = useMemo(() => {
    const notesById = new Map(notes.map((note) => [note.id, note]));
    return recentNoteIds.flatMap((id) => {
      const note = notesById.get(id);
      return note ? [note] : [];
    });
  }, [notes, recentNoteIds]);
  const vaultIndex = useMemo(() => createVaultIndex(tree), [tree]);

  const selectVault = useCallback((folder: Pick<DriveFile, 'id' | 'name'>) => {
    const vault = { id: folder.id, name: folder.name };
    localStorage.setItem(SELECTED_VAULT_KEY, JSON.stringify(vault));
    setSelectedVault(vault);
    setSelectedFile(null);
    setRecentNoteIds(readRecentNoteIds(vault.id));
    setRoutePath(null);
    clearNoteHash();
  }, []);

  const clearVault = useCallback(() => {
    localStorage.removeItem(SELECTED_VAULT_KEY);
    setSelectedVault(null);
    setSelectedFile(null);
    setRecentNoteIds([]);
    setRoutePath(null);
    clearNoteHash();
  }, []);

  const selectFile = useCallback((file: VaultNode) => {
    setSelectedFile(file);
    setRoutePath(file.path);
    setNoteHash(file.path);
  }, []);

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

      const parentFolderId = parentFolder?.id ?? selectedVault.id;
      const parentPath = parentFolder?.path ?? '';
      const file = await createDriveMarkdownFile(accessToken, parentFolderId, name);
      const node = createVaultNode(file, parentPath);

      setTree((currentTree) => addNodeToTree(currentTree, parentFolder?.id ?? null, node));
      selectFile(node);
      return node;
    },
    [accessToken, selectFile, selectedVault, setTree],
  );

  const renameNote = useCallback(
    async (note: VaultNode, name: string) => {
      if (!accessToken) {
        throw new Error('Sign in before renaming notes.');
      }

      const file = await renameDriveFile(accessToken, note.id, name);
      const parentPath = getParentPath(note.path);
      const updatedNote = createVaultNode(file, parentPath);

      setTree((currentTree) => replaceNodeInTree(currentTree, updatedNote));

      if (selectedFile?.id === note.id) {
        selectFile(updatedNote);
      }

      return updatedNote;
    },
    [accessToken, selectFile, selectedFile?.id, setTree],
  );

  const deleteNote = useCallback(
    async (note: VaultNode) => {
      if (!accessToken) {
        throw new Error('Sign in before deleting notes.');
      }

      await deleteDriveFile(accessToken, note.id);
      setTree((currentTree) => removeNodeFromTree(currentTree, note.id));
      setRecentNoteIds((currentIds) => {
        const nextIds = currentIds.filter((id) => id !== note.id);
        writeRecentNoteIds(selectedVault?.id ?? null, nextIds);
        return nextIds;
      });

      if (selectedFile?.id === note.id) {
        setSelectedFile(null);
        setRoutePath(null);
        clearNoteHash();
      }
    },
    [accessToken, selectedFile?.id, selectedVault?.id, setTree],
  );

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

    if (selectedFile?.path === routePath || notes.length === 0) return;

    const routedNote = vaultIndex.byPath.get(normalizeWikilinkTarget(routePath));
    if (routedNote) {
      setSelectedFile(routedNote);
    }
  }, [notes.length, routePath, selectedFile, vaultIndex]);

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
      clearVault,
      createNote,
      deleteNote,
      error,
      isLoading,
      notes,
      recentNotes,
      renameNote,
      resolveWikilink,
      selectFile,
      selectVault,
      selectedFile,
      selectedVault,
      tree,
    }),
    [
      clearVault,
      createNote,
      deleteNote,
      error,
      isLoading,
      notes,
      recentNotes,
      renameNote,
      resolveWikilink,
      selectFile,
      selectVault,
      selectedFile,
      selectedVault,
      tree,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

type VaultIndex = {
  byName: Map<string, VaultNode>;
  byPath: Map<string, VaultNode>;
};

function createVaultIndex(nodes: VaultNode[]): VaultIndex {
  const index: VaultIndex = {
    byName: new Map(),
    byPath: new Map(),
  };

  for (const node of flattenVaultTree(nodes)) {
    if (node.type !== 'markdown') continue;

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
