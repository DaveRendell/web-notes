import { useCallback, useEffect, useRef, useState } from 'react';
import { safeLocalStorage as localStorage } from '../lib/browserStorage';
import { isGoogleDriveAuthError } from '../lib/googleDrive';
import { createVaultSettings, loadDriveVaultSettings, saveDriveVaultSettings } from '../lib/vaultSettings';

const FAVORITES_CACHE_KEY = 'web-notes:vault-favourites-cache-v1';

type EnsureAccessToken = () => Promise<string>;

type UseVaultFavoritesOptions = {
  canSync: boolean;
  ensureAccessToken: EnsureAccessToken;
  invalidateAccessToken: () => void;
  isOnline: boolean;
  vaultId: string | null;
};

type FavoriteCacheEntry = {
  dirty: boolean;
  favourites: string[];
};

export function useVaultFavorites({
  canSync,
  ensureAccessToken,
  invalidateAccessToken,
  isOnline,
  vaultId,
}: UseVaultFavoritesOptions) {
  const initialEntry = readFavoriteCache(vaultId);
  const [favoriteNoteIds, setFavoriteNoteIds] = useState(initialEntry.favourites);
  const [favoriteSyncError, setFavoriteSyncError] = useState<string | null>(null);
  const activeVaultIdRef = useRef(vaultId);
  const ensureAccessTokenRef = useRef(ensureAccessToken);
  const invalidateAccessTokenRef = useRef(invalidateAccessToken);
  const favoriteNoteIdsRef = useRef(initialEntry.favourites);
  const fileIdsRef = useRef(new Map<string, string | null>());
  const dirtyVaultsRef = useRef(new Set(initialEntry.dirty && vaultId ? [vaultId] : []));
  const revisionsRef = useRef(new Map<string, number>());
  const writeQueuesRef = useRef(new Map<string, Promise<void>>());
  ensureAccessTokenRef.current = ensureAccessToken;
  invalidateAccessTokenRef.current = invalidateAccessToken;

  const withAccessToken = useCallback(async <T,>(operation: (accessToken: string) => Promise<T>) => {
    let token = await ensureAccessTokenRef.current();

    try {
      return await operation(token);
    } catch (error) {
      if (!isGoogleDriveAuthError(error)) throw error;

      invalidateAccessTokenRef.current();
      token = await ensureAccessTokenRef.current();
      return operation(token);
    }
  }, []);

  const refreshFavorites = useCallback(async (targetVaultId: string) => {
    if (!canSync || !isOnline || dirtyVaultsRef.current.has(targetVaultId)) return;

    const revision = revisionsRef.current.get(targetVaultId) ?? 0;
    if (activeVaultIdRef.current === targetVaultId) {
      setFavoriteSyncError(null);
    }

    try {
      const loaded = await withAccessToken((token) => loadDriveVaultSettings(token, targetVaultId));
      fileIdsRef.current.set(targetVaultId, loaded.file?.id ?? null);

      if (
        activeVaultIdRef.current === targetVaultId
        && !dirtyVaultsRef.current.has(targetVaultId)
        && (revisionsRef.current.get(targetVaultId) ?? 0) === revision
      ) {
        favoriteNoteIdsRef.current = loaded.settings.favourites;
        setFavoriteNoteIds(loaded.settings.favourites);
        writeFavoriteCache(targetVaultId, loaded.settings.favourites, false);
      }
    } catch (error) {
      if (activeVaultIdRef.current === targetVaultId) {
        setFavoriteSyncError(getSyncErrorMessage(error));
      }
    }
  }, [canSync, isOnline, withAccessToken]);

  const persistFavorites = useCallback((targetVaultId: string, favourites: string[]) => {
    const nextFavourites = [...new Set(favourites)];
    dirtyVaultsRef.current.add(targetVaultId);
    writeFavoriteCache(targetVaultId, nextFavourites, true);

    if (!canSync || !isOnline) return;

    if (activeVaultIdRef.current === targetVaultId) {
      setFavoriteSyncError(null);
    }

    const previousWrite = writeQueuesRef.current.get(targetVaultId) ?? Promise.resolve();
    const write = previousWrite
      .catch(() => undefined)
      .then(async () => {
        const savedFile = await withAccessToken(async (token) => {
          let fileId = fileIdsRef.current.get(targetVaultId);

          if (fileId === undefined) {
            const loaded = await loadDriveVaultSettings(token, targetVaultId);
            fileId = loaded.file?.id ?? null;
            fileIdsRef.current.set(targetVaultId, fileId);
          }

          return saveDriveVaultSettings(
            token,
            targetVaultId,
            fileId,
            createVaultSettings(nextFavourites),
          );
        });
        fileIdsRef.current.set(targetVaultId, savedFile.id);

        const currentFavourites = activeVaultIdRef.current === targetVaultId
          ? favoriteNoteIdsRef.current
          : readFavoriteCache(targetVaultId).favourites;
        if (arraysEqual(currentFavourites, nextFavourites)) {
          dirtyVaultsRef.current.delete(targetVaultId);
          writeFavoriteCache(targetVaultId, nextFavourites, false);
        }
      })
      .catch((error) => {
        if (activeVaultIdRef.current === targetVaultId) {
          setFavoriteSyncError(getSyncErrorMessage(error));
        }
        throw error;
      })
      .finally(() => {
        if (writeQueuesRef.current.get(targetVaultId) === write) {
          writeQueuesRef.current.delete(targetVaultId);
        }
      });

    writeQueuesRef.current.set(targetVaultId, write);
    void write.catch(() => undefined);
  }, [canSync, isOnline, withAccessToken]);

  const replaceFavorites = useCallback((nextIds: string[]) => {
    const targetVaultId = activeVaultIdRef.current;
    if (!targetVaultId) return;

    const uniqueIds = [...new Set(nextIds)];
    revisionsRef.current.set(targetVaultId, (revisionsRef.current.get(targetVaultId) ?? 0) + 1);
    favoriteNoteIdsRef.current = uniqueIds;
    setFavoriteNoteIds(uniqueIds);
    persistFavorites(targetVaultId, uniqueIds);
  }, [persistFavorites]);

  const toggleFavorite = useCallback((noteId: string) => {
    const currentIds = favoriteNoteIdsRef.current;
    replaceFavorites(currentIds.includes(noteId)
      ? currentIds.filter((id) => id !== noteId)
      : [...currentIds, noteId]);
  }, [replaceFavorites]);

  const reorderFavorite = useCallback((
    noteId: string,
    targetNoteId: string,
    placement: 'before' | 'after',
  ) => {
    const currentIds = favoriteNoteIdsRef.current;
    if (noteId === targetNoteId || !currentIds.includes(noteId) || !currentIds.includes(targetNoteId)) return;

    const nextIds = currentIds.filter((id) => id !== noteId);
    const targetIndex = nextIds.indexOf(targetNoteId);
    nextIds.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, noteId);
    replaceFavorites(nextIds);
  }, [replaceFavorites]);

  const removeFavorites = useCallback((noteIds: Set<string>) => {
    const nextIds = favoriteNoteIdsRef.current.filter((id) => !noteIds.has(id));
    if (nextIds.length !== favoriteNoteIdsRef.current.length) replaceFavorites(nextIds);
  }, [replaceFavorites]);

  useEffect(() => {
    activeVaultIdRef.current = vaultId;
    const cached = readFavoriteCache(vaultId);
    favoriteNoteIdsRef.current = cached.favourites;
    setFavoriteNoteIds(cached.favourites);
    setFavoriteSyncError(null);

    if (!vaultId) return;
    if (cached.dirty) dirtyVaultsRef.current.add(vaultId);

    if (cached.dirty) {
      persistFavorites(vaultId, cached.favourites);
    } else {
      void refreshFavorites(vaultId);
    }
  }, [persistFavorites, refreshFavorites, vaultId]);

  useEffect(() => {
    if (!vaultId) return;
    const targetVaultId = vaultId;

    function handleFocus() {
      if (dirtyVaultsRef.current.has(targetVaultId)) {
        persistFavorites(targetVaultId, favoriteNoteIdsRef.current);
      } else {
        void refreshFavorites(targetVaultId);
      }
    }

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [persistFavorites, refreshFavorites, vaultId]);

  return {
    favoriteNoteIds,
    favoriteSyncError,
    removeFavorites,
    reorderFavorite,
    toggleFavorite,
  };
}

function readFavoriteCache(vaultId: string | null): FavoriteCacheEntry {
  if (!vaultId) return { dirty: false, favourites: [] };

  try {
    const cache = JSON.parse(localStorage.getItem(FAVORITES_CACHE_KEY) ?? '{}') as Record<string, unknown>;
    const entry = cache[vaultId];
    if (!isObject(entry) || !Array.isArray(entry.favourites)) return { dirty: false, favourites: [] };

    return {
      dirty: entry.dirty === true,
      favourites: [...new Set(entry.favourites.filter((id): id is string => typeof id === 'string'))],
    };
  } catch {
    return { dirty: false, favourites: [] };
  }
}

function writeFavoriteCache(vaultId: string, favourites: string[], dirty: boolean) {
  let cache: Record<string, FavoriteCacheEntry> = {};

  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_CACHE_KEY) ?? '{}') as unknown;
    if (isObject(value)) cache = value as Record<string, FavoriteCacheEntry>;
  } catch {
    // Replace malformed cache data.
  }

  cache[vaultId] = { dirty, favourites };
  localStorage.setItem(FAVORITES_CACHE_KEY, JSON.stringify(cache));
}

function getSyncErrorMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : 'Unknown Google Drive error.';
  return `Favourites could not be synced: ${detail}`;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
