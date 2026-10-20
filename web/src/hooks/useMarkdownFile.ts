import { useCallback, useEffect, useRef, useState } from 'react';
import { getDriveFileText } from '../lib/googleDrive';
import { getNoteContent, putNoteContent } from '../lib/vaultCache';
import { VaultNode } from '../types/vault';

export function useMarkdownFile(
  accessToken: string | null,
  accountId: string | null,
  vaultId: string | null,
  file: VaultNode | null,
) {
  const revision = useRef(0);
  const loadedScope = useRef<string | null>(null);
  const [content, setContent] = useState('');
  const [loadedFileId, setLoadedFileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const fileId = file?.id;
  const modifiedTime = file?.source.modifiedTime;

  const cacheContent = useCallback(
    (nextContent: string, modifiedTime?: string) => {
      revision.current += 1;
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
    if (!fileId || !accountId || !vaultId) {
      loadedScope.current = null;
      setContent('');
      setLoadedFileId(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    // Keep the existing document mounted while reconnecting to Drive.
    if (!accessToken) return;

    const controller = new AbortController();
    const currentAccessToken = accessToken;
    const currentFile = { id: fileId };
    const scope = JSON.stringify([accountId, vaultId, currentFile.id]);
    const alreadyLoaded = loadedScope.current === scope;
    const initialRevision = revision.current;

    async function loadContent() {
      let cachedContent: Awaited<ReturnType<typeof getNoteContent>> = null;
      setError(null);
      setRefreshError(null);

      if (accountId && vaultId) {
        cachedContent = await getNoteContent(accountId, vaultId, currentFile.id);
        if (controller.signal.aborted || revision.current !== initialRevision) return;

        if (cachedContent && !alreadyLoaded && revision.current === initialRevision) {
          setContent(cachedContent.content);
          setLoadedFileId(currentFile.id);
          loadedScope.current = scope;
        }
      }

      const currentModifiedTime = modifiedTime;
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

      setIsLoading(!cachedContent && !alreadyLoaded);
      setIsRefreshing(Boolean(cachedContent) || alreadyLoaded);
      if (!cachedContent && !alreadyLoaded) {
        setContent('');
        setLoadedFileId(currentFile.id);
      }

      try {
        const text = await getDriveFileText(currentAccessToken, currentFile.id);
        if (controller.signal.aborted || revision.current !== initialRevision) return;

        setContent(text);
        setLoadedFileId(currentFile.id);
        loadedScope.current = scope;
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
        if (cachedContent || alreadyLoaded) {
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
  }, [accessToken, accountId, fileId, modifiedTime, vaultId]);

  const isSwitchingFile = Boolean(file && loadedFileId !== file.id);

  return {
    cacheContent,
    content: isSwitchingFile ? '' : content,
    error,
    isLoading: isLoading || isSwitchingFile,
    isRefreshing,
    refreshError,
    setContent: useCallback((nextContent: string) => {
      revision.current += 1;
      setContent(nextContent);
    }, []),
  };
}
