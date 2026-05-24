import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { useVaultTree } from '../hooks/useVaultTree';
import { DriveFile } from '../types/drive';
import { VaultNode } from '../types/vault';
import { useAuth } from './AuthContext';

const SELECTED_VAULT_KEY = 'vault-web-viewer:selected-vault';

type StoredVault = {
  id: string;
  name: string;
};

type VaultContextValue = {
  clearVault: () => void;
  error: string | null;
  isLoading: boolean;
  notes: VaultNode[];
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
  const { error, isLoading, tree } = useVaultTree(accessToken, selectedVault?.id ?? null);
  const notes = useMemo(() => flattenVaultTree(tree).filter((node) => node.type === 'markdown'), [tree]);
  const vaultIndex = useMemo(() => createVaultIndex(tree), [tree]);

  const selectVault = useCallback((folder: Pick<DriveFile, 'id' | 'name'>) => {
    const vault = { id: folder.id, name: folder.name };
    localStorage.setItem(SELECTED_VAULT_KEY, JSON.stringify(vault));
    setSelectedVault(vault);
    setSelectedFile(null);
  }, []);

  const clearVault = useCallback(() => {
    localStorage.removeItem(SELECTED_VAULT_KEY);
    setSelectedVault(null);
    setSelectedFile(null);
  }, []);

  const resolveWikilink = useCallback(
    (target: string) => {
      const normalizedTarget = normalizeWikilinkTarget(target);
      return vaultIndex.byPath.get(normalizedTarget) ?? vaultIndex.byName.get(normalizedTarget) ?? null;
    },
    [vaultIndex],
  );

  const value = useMemo(
    () => ({
      clearVault,
      error,
      isLoading,
      notes,
      resolveWikilink,
      selectFile: setSelectedFile,
      selectVault,
      selectedFile,
      selectedVault,
      tree,
    }),
    [clearVault, error, isLoading, notes, resolveWikilink, selectVault, selectedFile, selectedVault, tree],
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
