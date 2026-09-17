import { useEffect, useState } from 'react';
import { listDriveChildren } from '../lib/googleDrive';
import { DriveFile } from '../types/drive';

export function useDriveFolders(accessToken: string | null, folderId: string | null) {
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !folderId) {
      setFolders([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setFolders([]);
    setError(null);

    listDriveChildren({ accessToken, folderId, foldersOnly: true, signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) {
          setFolders(items);
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load Drive folders.');
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
  }, [accessToken, folderId]);

  return { error, folders, isLoading };
}
