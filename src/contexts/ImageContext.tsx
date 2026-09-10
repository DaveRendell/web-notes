import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';
import { getCachedImage, putCachedImage } from '../lib/imageCache';
import { useAuth } from './AuthContext';
import { useVault } from './VaultContext';
import { getDriveImage, isGoogleDriveAuthError } from '../lib/googleDrive';
import { flattenVaultNodes } from '../lib/vaultTree';
import { resolveVaultImage } from '../lib/vaultImages';
import type { VaultNode } from '../types/vault';

type ImageServices = {
  images: VaultNode[];
  scope: string;
  online: boolean;
  load: (source: string) => Promise<Blob>;
  version: (source: string) => string;
  upload: (file: File) => Promise<VaultNode>;
};
const ImageContext = createContext<ImageServices | null>(null);

export function ImageProvider({ children }: { children: ReactNode }) {
  const { accountId, ensureAccessToken, invalidateAccessToken } = useAuth();
  const { tree, selectedFile, selectedVault, isOnline, uploadImage } = useVault();
  const pending = useRef(new Map<string, Promise<Blob>>());
  const load = useCallback(async (source: string) => {
    const node = resolveVaultImage(source, selectedFile?.path ?? '', tree);
    if (!node || !accountId || !selectedVault) throw new Error('Image not found in this vault.');
    const key = JSON.stringify([accountId, selectedVault.id, node.id, node.source.modifiedTime, isOnline]);
    const existing = pending.current.get(key);
    if (existing) return existing;
    const request = (async () => {
      const cached = await getCachedImage(accountId, selectedVault.id, node.id, node.source.modifiedTime);
      if (cached) return cached;
      if (!isOnline) throw new Error('Vault images are unavailable offline.');
      let blob: Blob;
      try { blob = await getDriveImage(await ensureAccessToken(), node.id); }
      catch (error) {
        if (!isGoogleDriveAuthError(error)) throw error;
        invalidateAccessToken();
        blob = await getDriveImage(await ensureAccessToken(), node.id);
      }
      await putCachedImage(accountId, selectedVault.id, node.id, node.source.modifiedTime, blob);
      return blob;
    })();
    pending.current.set(key, request);
    try { return await request; }
    finally { pending.current.delete(key); }
  }, [accountId, ensureAccessToken, invalidateAccessToken, isOnline, selectedFile?.path, selectedVault, tree]);
  const version = (source: string) => {
    const node = resolveVaultImage(source, selectedFile?.path ?? '', tree);
    return `${node?.id}:${node?.source.modifiedTime}`;
  };
  return <ImageContext.Provider value={{ images: flattenVaultNodes(tree).filter((node) => node.type === 'image'), scope: `${accountId}:${selectedVault?.id}:${selectedFile?.path}`, online: isOnline, load, version, upload: uploadImage }}>{children}</ImageContext.Provider>;
}

// Optional so Markdown rendering also works outside the authenticated app.
export function useImages() { return useContext(ImageContext); }
