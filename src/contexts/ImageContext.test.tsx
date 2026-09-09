import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageProvider, useImages } from './ImageContext';
import { useAuth } from './AuthContext';
import { useVault } from './VaultContext';
import { getDriveImage, isGoogleDriveAuthError } from '../lib/googleDrive';

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('./VaultContext', () => ({ useVault: vi.fn() }));
vi.mock('../lib/googleDrive', () => ({ getDriveImage: vi.fn(), isGoogleDriveAuthError: vi.fn() }));
const ensureAccessToken = vi.fn();
const invalidateAccessToken = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({ accountId: 'account', ensureAccessToken, invalidateAccessToken } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useVault).mockReturnValue({
    tree: [{ id: 'image', name: 'photo.png', path: 'photo.png', type: 'image', source: { modifiedTime: 'version' } }],
    selectedFile: { path: 'note.md' }, selectedVault: { id: 'vault' }, isOnline: true, uploadImage: vi.fn(),
  } as unknown as ReturnType<typeof useVault>);
  ensureAccessToken.mockResolvedValue('token');
});
afterEach(cleanup);

describe('ImageProvider loading', () => {
  it('downloads a resolved image and retries authentication once', async () => {
    const blob = new Blob(['image']);
    vi.mocked(getDriveImage).mockRejectedValueOnce(new Error('expired')).mockResolvedValueOnce(blob);
    vi.mocked(isGoogleDriveAuthError).mockReturnValue(true);
    const { result } = renderHook(useImages, { wrapper: ImageProvider });
    expect(await result.current!.load('/photo.png')).toBe(blob);
    expect(invalidateAccessToken).toHaveBeenCalledOnce();
    expect(ensureAccessToken).toHaveBeenCalledTimes(2);
    expect(getDriveImage).toHaveBeenLastCalledWith('token', 'image');
  });
  it('does not retry non-authentication errors', async () => {
    vi.mocked(getDriveImage).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(useImages, { wrapper: ImageProvider });
    await expect(result.current!.load('/photo.png')).rejects.toThrow('network error');
    expect(getDriveImage).toHaveBeenCalledOnce();
    expect(invalidateAccessToken).not.toHaveBeenCalled();
  });
  it('rejects missing images without authenticating', async () => {
    const { result } = renderHook(useImages, { wrapper: ImageProvider });
    await expect(result.current!.load('/missing.png')).rejects.toThrow('Image not found');
    expect(ensureAccessToken).not.toHaveBeenCalled();
  });
  it('rejects downloads while offline without authenticating', async () => {
    vi.mocked(useVault).mockReturnValue({ ...useVault(), isOnline: false });
    const { result } = renderHook(useImages, { wrapper: ImageProvider });
    await expect(result.current!.load('/photo.png')).rejects.toThrow('offline');
    expect(ensureAccessToken).not.toHaveBeenCalled();
  });
});
