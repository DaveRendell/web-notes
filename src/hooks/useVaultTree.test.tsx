import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../types/drive';
import type { VaultNode } from '../types/vault';

const mocks = vi.hoisted(() => ({
  deleteMissingNoteContents: vi.fn(),
  getVaultTree: vi.fn(),
  listDriveChildren: vi.fn(),
  putVaultTree: vi.fn(),
}));

vi.mock('../lib/googleDrive', () => ({ listDriveChildren: mocks.listDriveChildren }));
vi.mock('../lib/vaultCache', () => ({
  createCachedVaultRecord: (accountId: string, vaultId: string, vaultName: string, tree: VaultNode[]) => ({
    accountId,
    vaultId,
    vaultName,
    tree,
    syncedAt: 1,
  }),
  deleteMissingNoteContents: mocks.deleteMissingNoteContents,
  getVaultTree: mocks.getVaultTree,
  putVaultTree: mocks.putVaultTree,
}));

import { useVaultTree } from './useVaultTree';

const cachedNode = createNode('cached', 'Cached.md', 'old');
const remoteFile = createFile('remote', 'Remote.md', 'new');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getVaultTree.mockResolvedValue(null);
  mocks.putVaultTree.mockResolvedValue(undefined);
  mocks.deleteMissingNoteContents.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('useVaultTree', () => {
  it('shows a cached tree while refreshing, then atomically replaces and prunes it after success', async () => {
    const remoteResponse = deferred<DriveFile[]>();
    mocks.getVaultTree.mockResolvedValue({ tree: [cachedNode] });
    mocks.listDriveChildren.mockReturnValue(remoteResponse.promise);

    const { result } = renderHook(() => useVaultTree('token', 'account', true, 'vault', 'My vault'));

    await waitFor(() => expect(result.current.tree[0]?.id).toBe('cached'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(true);
    expect(mocks.deleteMissingNoteContents).not.toHaveBeenCalled();

    await act(async () => remoteResponse.resolve([remoteFile]));

    await waitFor(() => expect(result.current.tree[0]?.id).toBe('remote'));
    expect(result.current.isRefreshing).toBe(false);
    expect(mocks.putVaultTree).toHaveBeenCalledWith(expect.objectContaining({ tree: [expect.objectContaining({ id: 'remote' })] }));
    expect(mocks.deleteMissingNoteContents).toHaveBeenCalledWith('account', 'vault', new Set(['remote']));
  });

  it('keeps stale files and reports a non-blocking refresh error without pruning after failure', async () => {
    mocks.getVaultTree.mockResolvedValue({ tree: [cachedNode] });
    mocks.listDriveChildren.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useVaultTree('token', 'account', true, 'vault', 'My vault'));

    await waitFor(() => expect(result.current.refreshError).toBe('offline'));
    expect(result.current.tree).toEqual([cachedNode]);
    expect(result.current.error).toBeNull();
    expect(mocks.deleteMissingNoteContents).not.toHaveBeenCalled();
  });

  it('uses the blocking error state when neither Drive nor the cache has a tree', async () => {
    mocks.listDriveChildren.mockRejectedValue(new Error('unavailable'));

    const { result } = renderHook(() => useVaultTree('token', 'account', true, 'vault', 'My vault'));

    await waitFor(() => expect(result.current.error).toBe('unavailable'));
    expect(result.current.tree).toEqual([]);
    expect(result.current.refreshError).toBeNull();
  });

  it('retries a failed listing when the browser returns online', async () => {
    mocks.getVaultTree.mockResolvedValue({ tree: [cachedNode] });
    mocks.listDriveChildren
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([remoteFile]);

    const { result } = renderHook(() => useVaultTree('token', 'account', true, 'vault', 'My vault'));
    await waitFor(() => expect(result.current.refreshError).toBe('offline'));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });

    await waitFor(() => expect(mocks.listDriveChildren).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.tree[0]?.id).toBe('remote'));
    expect(mocks.listDriveChildren).toHaveBeenCalledTimes(2);
    expect(result.current.refreshError).toBeNull();
  });
});

function createFile(id: string, name: string, modifiedTime: string): DriveFile {
  return { id, mimeType: 'text/markdown', modifiedTime, name };
}

function createNode(id: string, name: string, modifiedTime: string): VaultNode {
  return {
    ...createFile(id, name, modifiedTime),
    path: name,
    source: createFile(id, name, modifiedTime),
    type: 'markdown',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
