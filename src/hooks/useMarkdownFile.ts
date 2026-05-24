import { useEffect, useState } from 'react';
import { getDriveFileText } from '../lib/googleDrive';

export function useMarkdownFile(accessToken: string | null, fileId: string | null) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !fileId) {
      setContent('');
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    getDriveFileText(accessToken, fileId)
      .then((text) => {
        if (!controller.signal.aborted) {
          setContent(text);
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load markdown file.');
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
  }, [accessToken, fileId]);

  return { content, error, isLoading };
}
