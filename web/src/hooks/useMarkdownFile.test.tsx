import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../types/vault';

const mocks = vi.hoisted(() => ({
  getDriveFileText: vi.fn(),
  getNoteContent: vi.fn(),
  putNoteContent: vi.fn(),
}));

vi.mock('../lib/googleDrive', () => ({ getDriveFileText: mocks.getDriveFileText }));
vi.mock('../lib/vaultCache', () => ({
  getNoteContent: mocks.getNoteContent,
  putNoteContent: mocks.putNoteContent,
}));

import { useMarkdownFile } from './useMarkdownFile';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getNoteContent.mockResolvedValue(null);
  mocks.putNoteContent.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('useMarkdownFile', () => {
  it('uses cached content without a Drive body request when timestamps match exactly', async () => {
    mocks.getNoteContent.mockResolvedValue(cachedContent('cached body', 'same'));

    const { result } = renderHook(() => useMarkdownFile('token', 'account', 'vault', note('same')));

    await waitFor(() => expect(result.current.content).toBe('cached body'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
    expect(mocks.getDriveFileText).not.toHaveBeenCalled();
    expect(mocks.getNoteContent).toHaveBeenCalledWith('account', 'vault', 'note');
  });

  it('shows stale cached content until a timestamp mismatch is refreshed and cached', async () => {
    const response = deferred<string>();
    mocks.getNoteContent.mockResolvedValue(cachedContent('stale body', 'old'));
    mocks.getDriveFileText.mockReturnValue(response.promise);

    const { result } = renderHook(() => useMarkdownFile('token', 'account', 'vault', note('new')));

    await waitFor(() => expect(result.current.content).toBe('stale body'));
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.isLoading).toBe(false);

    await act(async () => response.resolve('fresh body'));

    await waitFor(() => expect(result.current.content).toBe('fresh body'));
    expect(mocks.putNoteContent).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'fresh body', fileId: 'note', modifiedTime: 'new' }),
    );
  });

  it.each([
    ['a cache miss', null],
    ['a missing cached timestamp', cachedContent('unversioned body', undefined)],
    ['a missing Drive timestamp', cachedContent('cached body', 'old')],
  ])('fetches from Drive for %s', async (_label, cachedRecord) => {
    mocks.getNoteContent.mockResolvedValue(cachedRecord);
    mocks.getDriveFileText.mockResolvedValue('network body');
    const driveTimestamp = cachedRecord?.modifiedTime === 'old' ? undefined : 'new';

    const { result } = renderHook(() => useMarkdownFile('token', 'account', 'vault', note(driveTimestamp)));

    await waitFor(() => expect(result.current.content).toBe('network body'));
    expect(mocks.getDriveFileText).toHaveBeenCalledWith('token', 'note');
  });

  it('keeps stale content and exposes a non-blocking error when its refresh fails', async () => {
    mocks.getNoteContent.mockResolvedValue(cachedContent('offline copy', 'old'));
    mocks.getDriveFileText.mockRejectedValue(new Error('Drive is offline'));

    const { result } = renderHook(() => useMarkdownFile('token', 'account', 'vault', note('new')));

    await waitFor(() => expect(result.current.refreshError).toBe('Drive is offline'));
    expect(result.current.content).toBe('offline copy');
    expect(result.current.error).toBeNull();
  });
});

function note(modifiedTime?: string): VaultNode {
  return {
    id: 'note',
    mimeType: 'text/markdown',
    name: 'Note.md',
    path: 'Note.md',
    source: { id: 'note', mimeType: 'text/markdown', modifiedTime, name: 'Note.md' },
    type: 'markdown',
  };
}

function cachedContent(content: string, modifiedTime?: string) {
  return {
    accountId: 'account',
    vaultId: 'vault',
    fileId: 'note',
    content,
    modifiedTime,
    cachedAt: 1,
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
