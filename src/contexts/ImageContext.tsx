import { createContext, useCallback, useContext, type ReactNode } from 'react';
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
  const load = useCallback(async (source: string) => {
    if (!isOnline) throw new Error('Vault images are unavailable offline.');
    const node = resolveVaultImage(source, selectedFile?.path ?? '', tree);
    if (!node || !accountId) throw new Error('Image not found in this vault.');
    try { return await getDriveImage(await ensureAccessToken(), node.id); }
    catch (error) {
      if (!isGoogleDriveAuthError(error)) throw error;
      invalidateAccessToken();
      return getDriveImage(await ensureAccessToken(), node.id);
    }
  }, [accountId, ensureAccessToken, invalidateAccessToken, isOnline, selectedFile?.path, tree]);
  const version = (source: string) => {
    const node = resolveVaultImage(source, selectedFile?.path ?? '', tree);
    return `${node?.id}:${node?.source.modifiedTime}`;
  };
  return <ImageContext.Provider value={{ images: flattenVaultNodes(tree).filter((node) => node.type === 'image'), scope: `${accountId}:${selectedVault?.id}:${selectedFile?.path}`, online: isOnline, load, version, upload: uploadImage }}>{children}</ImageContext.Provider>;
}

// Optional so Markdown rendering also works outside the authenticated app.
export function useImages() { return useContext(ImageContext); }
