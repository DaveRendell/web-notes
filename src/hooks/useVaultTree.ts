import { useEffect, useState } from 'react';
import { listDriveChildren } from '../lib/googleDrive';
import { createVaultNode, sortVaultNodes } from '../lib/vaultTree';
import { GOOGLE_FOLDER_MIME_TYPE } from '../types/drive';
import { VaultNode } from '../types/vault';

export function useVaultTree(accessToken: string | null, rootFolderId: string | null) {
  const [tree, setTree] = useState<VaultNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !rootFolderId) {
      setTree([]);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    loadTree(accessToken, rootFolderId, '', controller.signal)
      .then((nodes) => {
        if (!controller.signal.aborted) {
          setTree(nodes);
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load vault tree.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [accessToken, rootFolderId]);

  return { error, isLoading, tree };
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
