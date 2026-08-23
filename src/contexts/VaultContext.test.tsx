import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../types/drive';
import type { VaultNode } from '../types/vault';

const mocks = vi.hoisted(() => ({
  createDriveMarkdownFile: vi.fn(),
  deleteDriveFile: vi.fn(),
  deleteNoteContent: vi.fn(),
  putNoteContent: vi.fn(),
  putVaultTree: vi.fn(),
  renameDriveFile: vi.fn(),
  updateNoteContentVersion: vi.fn(),
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    accessToken: 'token',
    accountId: 'account',
    ensureAccessToken: () => Promise.resolve('valid-token'),
    isAccountResolved: true,
  }),
}));
vi.mock('../lib/googleDrive', () => ({
  createDriveMarkdownFile: mocks.createDriveMarkdownFile,
  deleteDriveFile: mocks.deleteDriveFile,
  renameDriveFile: mocks.renameDriveFile,
}));
vi.mock('../lib/vaultCache', () => ({
  deleteNoteContent: mocks.deleteNoteContent,
  putNoteContent: mocks.putNoteContent,
  updateNoteContentVersion: mocks.updateNoteContentVersion,
}));
vi.mock('../hooks/useVaultTree', async () => {
  const React = await import('react');
  return {
    useVaultTree: () => {
      const [tree, setTree] = React.useState<VaultNode[]>([]);
      return {
        error: null,
        isLoading: false,
        isRefreshing: false,
        refreshError: null,
        setTree,
        tree,
      };
    },
  };
});

import { useVault, VaultProvider } from './VaultContext';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', window.location.pathname);
  localStorage.setItem('vault-web-viewer:selected-vault', JSON.stringify({ id: 'vault', name: 'My vault' }));
  mocks.createDriveMarkdownFile.mockResolvedValue(file('note', 'Note.md', 'created'));
  mocks.renameDriveFile.mockResolvedValue(file('note', 'Renamed.md', 'renamed'));
  mocks.deleteDriveFile.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('VaultContext cache mutations', () => {
  it('updates cached bodies and tree metadata for create, rename, save, and delete', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let created!: VaultNode;
    await act(async () => {
      created = await result.current.createNote(null, 'Note');
    });
    expect(result.current.tree[0]?.id).toBe('note');
    expect(mocks.putNoteContent).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account', content: '', fileId: 'note', modifiedTime: 'created' }),
    );

    let renamed!: VaultNode;
    await act(async () => {
      renamed = await result.current.renameNote(created, 'Renamed');
    });
    expect(result.current.tree[0]?.name).toBe('Renamed.md');
    expect(mocks.updateNoteContentVersion).toHaveBeenCalledWith('account', 'vault', 'note', 'renamed');

    act(() => result.current.storeSavedNote(renamed, file('note', 'Renamed.md', 'saved'), 'new body'));
    expect(result.current.tree[0]?.source.modifiedTime).toBe('saved');
    expect(mocks.putNoteContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: 'new body', fileId: 'note', modifiedTime: 'saved' }),
    );

    await act(async () => result.current.deleteNote(result.current.tree[0]));
    await waitFor(() => expect(result.current.tree).toEqual([]));
    expect(mocks.deleteNoteContent).toHaveBeenCalledWith('account', 'vault', 'note');
  });
});

function file(id: string, name: string, modifiedTime: string): DriveFile {
  return { id, mimeType: 'text/markdown', modifiedTime, name, parents: ['vault'] };
}
