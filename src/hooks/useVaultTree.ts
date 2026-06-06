import { useCallback, useEffect, useState } from 'react';
import { listDriveChildren } from '../lib/googleDrive';
import { createVaultNode, sortVaultNodes } from '../lib/vaultTree';
import { GOOGLE_FOLDER_MIME_TYPE } from '../types/drive';
import { VaultNode } from '../types/vault';

export function useVaultTree(accessToken: string | null, rootFolderId: string | null) {
  const [tree, setTree] = useState<VaultNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadTree = useCallback((signal?: AbortSignal) => {
    if (!accessToken || !rootFolderId) {
      setTree([]);
      return Promise.resolve();
    }

    setIsLoading(true);
    setError(null);

    return loadTree(accessToken, rootFolderId, '', signal ?? new AbortController().signal)
      .then((nodes) => {
        if (!signal?.aborted) {
          setTree(nodes);
        }
      })
      .catch((requestError: unknown) => {
        if (!signal?.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load vault tree.');
        }
      })
      .finally(() => {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      });
  }, [accessToken, rootFolderId]);

  useEffect(() => {
    const controller = new AbortController();

    void reloadTree(controller.signal);

    return () => {
      controller.abort();
    };
  }, [reloadTree]);

  return { error, isLoading, reloadTree, setTree, tree };
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
