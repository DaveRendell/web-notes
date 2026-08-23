import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { listDriveChildren } from '../lib/googleDrive';
import {
  createCachedVaultRecord,
  deleteMissingNoteContents,
  getVaultTree,
  putVaultTree,
} from '../lib/vaultCache';
import { createVaultNode, sortVaultNodes } from '../lib/vaultTree';
import { GOOGLE_FOLDER_MIME_TYPE } from '../types/drive';
import { VaultNode } from '../types/vault';

export function useVaultTree(
  accessToken: string | null,
  accountId: string | null,
  isAccountResolved: boolean,
  rootFolderId: string | null,
  rootFolderName: string | null,
) {
  const [tree, setTreeState] = useState<VaultNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const shouldRetryWhenOnline = useRef(false);
  const activeCacheScope = useRef<string | null>(null);

  const persistTree = useCallback(
    (nextTree: VaultNode[]) => {
      if (!accountId || !rootFolderId || !rootFolderName) return;
      void putVaultTree(createCachedVaultRecord(accountId, rootFolderId, rootFolderName, nextTree));
    },
    [accountId, rootFolderId, rootFolderName],
  );

  const setTree: Dispatch<SetStateAction<VaultNode[]>> = useCallback(
    (update) => {
      setTreeState((currentTree) => {
        const nextTree = typeof update === 'function' ? update(currentTree) : update;
        persistTree(nextTree);
        return nextTree;
      });
    },
    [persistTree],
  );

  const reloadTree = useCallback(
    async (signal?: AbortSignal) => {
      if (!accessToken || !rootFolderId) {
        shouldRetryWhenOnline.current = false;
        activeCacheScope.current = null;
        setTreeState([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (!isAccountResolved) {
        setIsLoading(true);
        return;
      }

      const activeSignal = signal ?? new AbortController().signal;
      let hasCachedTree = false;
      const cacheScope = `${accountId ?? 'network-only'}:${rootFolderId}`;

      if (activeCacheScope.current !== cacheScope) {
        activeCacheScope.current = cacheScope;
        setTreeState([]);
      }

      setError(null);
      setRefreshError(null);

      if (accountId) {
        const cachedVault = await getVaultTree(accountId, rootFolderId);
        if (activeSignal.aborted) return;

        if (cachedVault) {
          hasCachedTree = true;
          setTreeState(cachedVault.tree);
        }
      }

      setIsLoading(!hasCachedTree);
      setIsRefreshing(true);

      try {
        const nodes = await loadTree(accessToken, rootFolderId, '', activeSignal);
        if (activeSignal.aborted) return;

        setTreeState(nodes);
        shouldRetryWhenOnline.current = false;
        setError(null);
        setRefreshError(null);
        persistTree(nodes);

        if (accountId) {
          await deleteMissingNoteContents(accountId, rootFolderId, collectMarkdownFileIds(nodes));
        }
      } catch (requestError) {
        if (activeSignal.aborted) return;

        const message = requestError instanceof Error ? requestError.message : 'Failed to load vault tree.';
        shouldRetryWhenOnline.current = true;
        if (hasCachedTree) {
          setRefreshError(message);
        } else {
          setError(message);
        }
      } finally {
        if (!activeSignal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [accessToken, accountId, isAccountResolved, persistTree, rootFolderId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reloadTree(controller.signal);

    return () => controller.abort();
  }, [reloadTree]);

  useEffect(() => {
    function handleOnline() {
      if (shouldRetryWhenOnline.current) void reloadTree();
    }

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [reloadTree]);

  return { error, isLoading, isRefreshing, refreshError, reloadTree, setTree, tree };
}

async function loadTree(
  accessToken: string,
  folderId: string,
  parentPath: string,
  signal: AbortSignal,
): Promise<VaultNode[]> {
  if (signal.aborted) return [];

  const children = await listDriveChildren({ accessToken, folderId });
  const visibleChildren = children.filter(
    (child) => child.mimeType === GOOGLE_FOLDER_MIME_TYPE || child.name.toLowerCase().endsWith('.md'),
  );

  const nodes = await Promise.all(
    visibleChildren.map(async (child) => {
      const node = createVaultNode(child, parentPath);

      if (child.mimeType === GOOGLE_FOLDER_MIME_TYPE) {
        node.children = await loadTree(accessToken, child.id, node.path, signal);
      }

      return node;
    }),
  );

  return sortVaultNodes(nodes);
}

function collectMarkdownFileIds(nodes: VaultNode[]): Set<string> {
  const fileIds = new Set<string>();

  for (const node of nodes) {
    if (node.type === 'markdown') fileIds.add(node.id);
    if (node.children) {
      for (const childId of collectMarkdownFileIds(node.children)) fileIds.add(childId);
    }
  }

  return fileIds;
}
