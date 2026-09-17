import { useCallback, useEffect, useState } from 'react';
import { getDriveFileText } from '../lib/googleDrive';
import { getNoteContent, putNoteContent } from '../lib/vaultCache';
import { VaultNode } from '../types/vault';

export function useMarkdownFile(
  accessToken: string | null,
  accountId: string | null,
  vaultId: string | null,
  file: VaultNode | null,
) {
  const [content, setContent] = useState('');
  const [loadedFileId, setLoadedFileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const cacheContent = useCallback(
    (nextContent: string, modifiedTime?: string) => {
      setContent(nextContent);
      setLoadedFileId(file?.id ?? null);

      if (!accountId || !vaultId || !file) return;
      void putNoteContent({
        accountId,
        vaultId,
        fileId: file.id,
        content: nextContent,
        modifiedTime,
        cachedAt: Date.now(),
      });
    },
    [accountId, file, vaultId],
  );

  useEffect(() => {
    if (!accessToken || !file) {
      setContent('');
      setLoadedFileId(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const controller = new AbortController();
    const currentAccessToken = accessToken;
    const currentFile = file;

    async function loadContent() {
      let cachedContent: Awaited<ReturnType<typeof getNoteContent>> = null;
      setError(null);
      setRefreshError(null);

      if (accountId && vaultId) {
        cachedContent = await getNoteContent(accountId, vaultId, currentFile.id);
        if (controller.signal.aborted) return;

        if (cachedContent) {
          setContent(cachedContent.content);
          setLoadedFileId(currentFile.id);
        }
      }

      const currentModifiedTime = currentFile.source.modifiedTime;
      const cacheIsCurrent = Boolean(
        cachedContent?.modifiedTime &&
          currentModifiedTime &&
          cachedContent.modifiedTime === currentModifiedTime,
      );

      if (cacheIsCurrent) {
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setIsLoading(!cachedContent);
      setIsRefreshing(Boolean(cachedContent));
      if (!cachedContent) {
        setContent('');
        setLoadedFileId(currentFile.id);
      }

      try {
        const text = await getDriveFileText(currentAccessToken, currentFile.id);
        if (controller.signal.aborted) return;

        setContent(text);
        setLoadedFileId(currentFile.id);
        setError(null);
        setRefreshError(null);

        if (accountId && vaultId) {
          await putNoteContent({
            accountId,
            vaultId,
            fileId: currentFile.id,
            content: text,
            modifiedTime: currentModifiedTime,
            cachedAt: Date.now(),
          });
        }
      } catch (requestError) {
        if (controller.signal.aborted) return;

        const message = requestError instanceof Error ? requestError.message : 'Failed to load markdown file.';
        if (cachedContent) {
          setRefreshError(message);
        } else {
          setError(message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    void loadContent();
    return () => controller.abort();
  }, [accessToken, accountId, file, vaultId]);

  const isSwitchingFile = Boolean(file && loadedFileId !== file.id);

  return {
    cacheContent,
    content: isSwitchingFile ? '' : content,
    error,
    isLoading: isLoading || isSwitchingFile,
    isRefreshing,
    refreshError,
    setContent,
  };
}
