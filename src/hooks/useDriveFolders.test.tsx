import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listDriveChildren } from '../lib/googleDrive';
import { useDriveFolders } from './useDriveFolders';

vi.mock('../lib/googleDrive', () => ({ listDriveChildren: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('folder picker requests', () => {
  it('cancels pending requests and clears loading on sign-out', async () => {
    let resolve!: (files: []) => void;
    vi.mocked(listDriveChildren).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook(({ token }) => useDriveFolders(token, 'root'), { initialProps: { token: 'token' as string | null } });
    const signal = vi.mocked(listDriveChildren).mock.calls[0][0].signal;
    expect(result.current.isLoading).toBe(true);
    rerender({ token: null });
    expect(signal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    await act(async () => resolve([]));
    expect(result.current.folders).toEqual([]);
  });
  it('clears old folders while loading a new parent and clears errors on sign-out', async () => {
    vi.mocked(listDriveChildren).mockResolvedValueOnce([{ id: 'folder', name: 'Folder', mimeType: 'application/vnd.google-apps.folder' }]);
    const { result, rerender } = renderHook(({ parent }) => useDriveFolders('token', parent), { initialProps: { parent: 'root' as string | null } });
    await waitFor(() => expect(result.current.folders).toHaveLength(1));
    vi.mocked(listDriveChildren).mockRejectedValueOnce(new Error('Unavailable'));
    rerender({ parent: 'other' });
    expect(result.current.folders).toEqual([]);
    await waitFor(() => expect(result.current.error).toBe('Unavailable'));
    rerender({ parent: null });
    expect(result.current.error).toBeNull();
  });
});
