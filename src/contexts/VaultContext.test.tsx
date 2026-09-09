import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../types/drive';
import type { VaultNode } from '../types/vault';

const mocks = vi.hoisted(() => ({
  createDriveFolder: vi.fn(),
  createDriveMarkdownFile: vi.fn(),
  deleteDriveFile: vi.fn(),
  deleteNoteContent: vi.fn(),
  ensureAccessToken: vi.fn(),
  getNoteIcons: vi.fn(),
  loadDriveVaultSettings: vi.fn(),
  moveDriveFile: vi.fn(),
  invalidateAccessToken: vi.fn(),
  putNoteContent: vi.fn(),
  putNoteIcon: vi.fn(),
  putVaultTree: vi.fn(),
  renameDriveFile: vi.fn(),
  renameDriveFolder: vi.fn(),
  renameDriveItem: vi.fn(),
  uploadDriveImage: vi.fn(),
  saveDriveVaultSettings: vi.fn(),
  updateNoteContentVersion: vi.fn(),
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    accessToken: 'token',
    accountId: 'account',
    ensureAccessToken: mocks.ensureAccessToken,
    invalidateAccessToken: mocks.invalidateAccessToken,
    isAccountResolved: true,
  }),
}));
vi.mock('../lib/googleDrive', () => ({
  createDriveFolder: mocks.createDriveFolder,
  createDriveMarkdownFile: mocks.createDriveMarkdownFile,
  deleteDriveFile: mocks.deleteDriveFile,
  isGoogleDriveAuthError: (error: unknown) => (
    typeof error === 'object' && error !== null && 'status' in error && error.status === 401
  ),
  moveDriveFile: mocks.moveDriveFile,
  renameDriveFile: mocks.renameDriveFile,
  renameDriveFolder: mocks.renameDriveFolder,
  renameDriveItem: mocks.renameDriveItem,
  uploadDriveImage: mocks.uploadDriveImage,
}));
vi.mock('../lib/vaultCache', () => ({
  deleteNoteContent: mocks.deleteNoteContent,
  getNoteIcons: mocks.getNoteIcons,
  putNoteContent: mocks.putNoteContent,
  putNoteIcon: mocks.putNoteIcon,
  updateNoteContentVersion: mocks.updateNoteContentVersion,
}));
vi.mock('../lib/vaultSettings', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/vaultSettings')>();
  return {
    ...original,
    loadDriveVaultSettings: mocks.loadDriveVaultSettings,
    saveDriveVaultSettings: mocks.saveDriveVaultSettings,
  };
});
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
  mocks.getNoteIcons.mockResolvedValue([]);
  mocks.ensureAccessToken.mockResolvedValue('valid-token');
  mocks.loadDriveVaultSettings.mockResolvedValue({
    file: { id: 'settings', mimeType: 'application/json', name: '.web-notes.json' },
    settings: { version: 1, favourites: [] },
  });
  mocks.saveDriveVaultSettings.mockResolvedValue({
    id: 'settings',
    mimeType: 'application/json',
    name: '.web-notes.json',
  });
  localStorage.clear();
  window.history.replaceState(null, '', window.location.pathname);
  localStorage.setItem('vault-web-viewer:selected-vault', JSON.stringify({ id: 'vault', name: 'My vault' }));
  mocks.createDriveMarkdownFile.mockResolvedValue(file('note', 'Note.md', 'created'));
  mocks.createDriveFolder
    .mockResolvedValueOnce(folder('folder', 'Folder'))
    .mockResolvedValueOnce(folder('nested', 'Nested', 'folder'));
  mocks.renameDriveFile.mockResolvedValue(file('note', 'Renamed.md', 'renamed'));
  mocks.renameDriveFolder.mockResolvedValue(folder('folder', 'Renamed Folder'));
  mocks.deleteDriveFile.mockResolvedValue(undefined);
});

afterEach(cleanup);

it('renames and deletes an image, reconciles selection, and retains state on failure', async () => {
  const original = { id: 'image', name: 'photo.png', mimeType: 'image/png', parents: ['vault'], modifiedTime: 'one' };
  mocks.uploadDriveImage.mockResolvedValue(original);
  mocks.renameDriveItem.mockResolvedValue({ ...original, name: 'Renamed.png', modifiedTime: 'two' });
  const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
  const { result } = renderHook(() => useVault(), { wrapper });
  let image!: VaultNode;
  await act(async () => { image = await result.current.uploadImage(new File(['bytes'], 'photo.png', { type: 'image/png' })); });
  act(() => result.current.selectFile(image));
  await act(async () => { await result.current.renameImage(image, 'Renamed'); });
  expect(mocks.renameDriveItem).toHaveBeenCalledWith('valid-token', 'image', 'Renamed.png');
  expect(result.current.tree[0].name).toBe('Renamed.png');
  expect(result.current.selectedFile?.name).toBe('Renamed.png');
  expect(window.location.hash).toContain('Renamed.png');
  mocks.deleteDriveFile.mockRejectedValueOnce(new Error('Denied'));
  await act(async () => { await expect(result.current.deleteImage(image)).rejects.toThrow('Denied'); });
  expect(result.current.tree).toHaveLength(1);
  await act(async () => { await result.current.deleteImage(image); });
  expect(result.current.tree).toHaveLength(0);
  expect(result.current.selectedFile).toBeNull();
});

describe('VaultContext cache mutations', () => {
  it('updates the selected note for browser back and forward navigation', async () => {
    mocks.createDriveMarkdownFile
      .mockResolvedValueOnce(file('alpha', 'Alpha.md', 'created'))
      .mockResolvedValueOnce(file('beta', 'Beta.md', 'created'));
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    await act(async () => {
      await result.current.createNote(null, 'Alpha');
      await result.current.createNote(null, 'Beta');
    });
    expect(result.current.selectedFile?.id).toBe('beta');

    act(() => {
      window.history.replaceState(null, '', '#/note/Alpha.md');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(result.current.selectedFile?.id).toBe('alpha'));
    expect(window.location.hash).toBe('#/note/Alpha.md');

    act(() => {
      window.history.replaceState(null, '', '#/note/Beta.md');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(result.current.selectedFile?.id).toBe('beta'));
    expect(window.location.hash).toBe('#/note/Beta.md');
  });

  it('persists and reorders favourites in the vault settings file', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    act(() => {
      result.current.toggleFavorite('first');
      result.current.toggleFavorite('second');
    });
    expect(result.current.favoriteNoteIds).toEqual(['first', 'second']);

    act(() => result.current.reorderFavorite('second', 'first', 'before'));
    expect(result.current.favoriteNoteIds).toEqual(['second', 'first']);
    await waitFor(() => expect(mocks.saveDriveVaultSettings).toHaveBeenLastCalledWith(
      'valid-token',
      'vault',
      'settings',
      { version: 1, favourites: ['second', 'first'] },
    ));

    act(() => result.current.toggleFavorite('second'));
    expect(result.current.favoriteNoteIds).toEqual(['first']);
  });

  it('loads remote favourites and refreshes them when the browser regains focus', async () => {
    mocks.loadDriveVaultSettings
      .mockResolvedValueOnce({
        file: { id: 'settings', mimeType: 'application/json', name: '.web-notes.json' },
        settings: { version: 1, favourites: ['first'] },
      })
      .mockResolvedValueOnce({
        file: { id: 'settings', mimeType: 'application/json', name: '.web-notes.json' },
        settings: { version: 1, favourites: ['second', 'first'] },
      });
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    await waitFor(() => expect(result.current.favoriteNoteIds).toEqual(['first']));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(result.current.favoriteNoteIds).toEqual(['second', 'first']));
  });

  it('reconnects and retries when the favourites token has expired', async () => {
    mocks.loadDriveVaultSettings
      .mockRejectedValueOnce(Object.assign(new Error('Expired'), { status: 401 }))
      .mockResolvedValueOnce({
        file: { id: 'settings', mimeType: 'application/json', name: '.web-notes.json' },
        settings: { version: 1, favourites: ['note'] },
      });
    mocks.ensureAccessToken
      .mockResolvedValueOnce('expired-token')
      .mockResolvedValueOnce('refreshed-token');
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    await waitFor(() => expect(result.current.favoriteNoteIds).toEqual(['note']));
    expect(mocks.invalidateAccessToken).toHaveBeenCalledOnce();
    expect(mocks.loadDriveVaultSettings).toHaveBeenNthCalledWith(1, 'expired-token', 'vault');
    expect(mocks.loadDriveVaultSettings).toHaveBeenNthCalledWith(2, 'refreshed-token', 'vault');
  });

  it('creates folders at the vault root and inside existing folders', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let rootFolder!: VaultNode;
    await act(async () => {
      rootFolder = await result.current.createFolder(null, 'Folder');
    });
    expect(mocks.createDriveFolder).toHaveBeenNthCalledWith(1, 'valid-token', 'vault', 'Folder');
    expect(result.current.tree[0]).toEqual(expect.objectContaining({ id: 'folder', type: 'folder' }));

    await act(async () => {
      await result.current.createFolder(rootFolder, 'Nested');
    });
    expect(mocks.createDriveFolder).toHaveBeenNthCalledWith(2, 'valid-token', 'folder', 'Nested');
    expect(result.current.tree[0]?.children?.[0]).toEqual(
      expect.objectContaining({ id: 'nested', path: 'Folder/Nested', type: 'folder' }),
    );
    expect(mocks.putNoteContent).not.toHaveBeenCalled();
  });

  it('updates cached bodies and tree metadata for create, rename, save, and delete', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let created!: VaultNode;
    await act(async () => {
      created = await result.current.createNote(null, 'Note');
    });
    expect(result.current.tree[0]?.id).toBe('note');
    await waitFor(() => expect(document.title).toBe('Note'));
    expect(mocks.putNoteContent).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account', content: '', fileId: 'note', modifiedTime: 'created' }),
    );

    let renamed!: VaultNode;
    await act(async () => {
      renamed = await result.current.renameNote(created, 'Renamed');
    });
    expect(result.current.tree[0]?.name).toBe('Renamed.md');
    await waitFor(() => expect(document.title).toBe('Renamed'));
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

  it('derives and caches a note icon only when content is supplied', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    act(() => result.current.cacheNoteIcon('note', '---\ntitle: ignored\n---\n# 🎯 Goal'));

    expect(result.current.noteIcons.note).toBe('🎯');
    expect(mocks.putNoteIcon).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account', emoji: '🎯', fileId: 'note', vaultId: 'vault' }),
    );
  });

  it('loads previously cached note icons for the selected account and vault', async () => {
    mocks.getNoteIcons.mockResolvedValue([
      { accountId: 'account', vaultId: 'vault', fileId: 'note', emoji: '📚', cachedAt: 1 },
    ]);
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    await waitFor(() => expect(result.current.noteIcons.note).toBe('📚'));
    expect(mocks.getNoteIcons).toHaveBeenCalledWith('account', 'vault');
  });

  it('renames a folder and rebases all descendant paths', async () => {
    mocks.createDriveFolder.mockReset();
    mocks.createDriveFolder
      .mockResolvedValueOnce(folder('folder', 'Folder'))
      .mockResolvedValueOnce(folder('nested', 'Nested', 'folder'));
    mocks.createDriveMarkdownFile.mockResolvedValue(file('note', 'Note.md', 'created'));

    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let rootFolder!: VaultNode;
    await act(async () => {
      rootFolder = await result.current.createFolder(null, 'Folder');
      const nested = await result.current.createFolder(rootFolder, 'Nested');
      await result.current.createNote(nested, 'Note');
    });
    await act(async () => {
      await result.current.renameFolder(rootFolder, 'Renamed Folder');
    });

    expect(mocks.renameDriveFolder).toHaveBeenCalledWith('valid-token', 'folder', 'Renamed Folder');
    expect(result.current.tree[0]).toEqual(expect.objectContaining({ name: 'Renamed Folder', path: 'Renamed Folder' }));
    expect(result.current.tree[0]?.children?.[0]?.children?.[0]?.path).toBe('Renamed Folder/Nested/Note.md');
    await waitFor(() => expect(result.current.selectedFile?.path).toBe('Renamed Folder/Nested/Note.md'));
    expect(window.location.hash).toBe('#/note/Renamed%20Folder%2FNested%2FNote.md');
  });

  it('deletes a folder, its descendant note caches, and the selected descendant', async () => {
    mocks.createDriveFolder.mockReset();
    mocks.createDriveFolder.mockResolvedValue(folder('folder', 'Folder'));
    mocks.createDriveMarkdownFile.mockResolvedValue(file('note', 'Note.md', 'created'));

    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let rootFolder!: VaultNode;
    await act(async () => {
      rootFolder = await result.current.createFolder(null, 'Folder');
      await result.current.createNote(rootFolder, 'Note');
    });
    await act(async () => {
      await result.current.deleteFolder(rootFolder);
    });

    expect(mocks.deleteDriveFile).toHaveBeenCalledWith('valid-token', 'folder');
    expect(result.current.tree).toEqual([]);
    expect(mocks.deleteNoteContent).toHaveBeenCalledWith('account', 'vault', 'note');
    expect(result.current.selectedFile).toBeNull();
  });

  it('moves folders with their descendants and rebases every path', async () => {
    mocks.createDriveFolder.mockReset();
    mocks.createDriveFolder
      .mockResolvedValueOnce(folder('folder-a', 'Folder A'))
      .mockResolvedValueOnce(folder('nested', 'Nested', 'folder-a'))
      .mockResolvedValueOnce(folder('folder-b', 'Folder B'));
    mocks.createDriveMarkdownFile.mockResolvedValue(file('child-note', 'Child.md', 'created'));
    mocks.moveDriveFile.mockResolvedValue(folder('folder-a', 'Folder A', 'folder-b'));

    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let folderA!: VaultNode;
    let nested!: VaultNode;
    let folderB!: VaultNode;
    await act(async () => {
      folderA = await result.current.createFolder(null, 'Folder A');
      nested = await result.current.createFolder(folderA, 'Nested');
      await result.current.createNote(nested, 'Child');
      folderB = await result.current.createFolder(null, 'Folder B');
    });

    await act(async () => {
      await result.current.moveNode(folderA, folderB);
    });

    expect(mocks.moveDriveFile).toHaveBeenCalledWith('valid-token', 'folder-a', 'vault', 'folder-b');
    const movedFolder = result.current.tree[0]?.id === 'folder-b' ? result.current.tree[0].children?.[0] : undefined;
    expect(movedFolder).toEqual(expect.objectContaining({ id: 'folder-a', path: 'Folder B/Folder A' }));
    expect(movedFolder?.children?.[0]).toEqual(expect.objectContaining({ path: 'Folder B/Folder A/Nested' }));
    expect(movedFolder?.children?.[0]?.children?.[0]).toEqual(
      expect.objectContaining({ path: 'Folder B/Folder A/Nested/Child.md' }),
    );
    await waitFor(() => expect(result.current.selectedFile?.path).toBe('Folder B/Folder A/Nested/Child.md'));
    expect(mocks.updateNoteContentVersion).not.toHaveBeenCalled();
  });

  it('moves a note to the vault root and advances its cached metadata', async () => {
    mocks.createDriveFolder.mockReset();
    mocks.createDriveFolder.mockResolvedValue(folder('folder', 'Folder'));
    mocks.createDriveMarkdownFile.mockResolvedValue(file('note', 'Note.md', 'created'));
    mocks.moveDriveFile.mockResolvedValue(file('note', 'Note.md', 'moved'));

    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let note!: VaultNode;
    await act(async () => {
      const parent = await result.current.createFolder(null, 'Folder');
      note = await result.current.createNote(parent, 'Note');
    });
    await act(async () => {
      await result.current.moveNode(note, null);
    });

    expect(mocks.moveDriveFile).toHaveBeenCalledWith('valid-token', 'note', 'folder', 'vault');
    expect(result.current.tree.find((node) => node.id === 'note')?.path).toBe('Note.md');
    expect(mocks.updateNoteContentVersion).toHaveBeenCalledWith('account', 'vault', 'note', 'moved');
  });

  it('updates the tree before the Drive move request completes', async () => {
    const moveResponse = deferred<DriveFile>();
    mocks.createDriveFolder.mockReset();
    mocks.createDriveFolder.mockResolvedValue(folder('folder', 'Folder'));
    mocks.createDriveMarkdownFile.mockResolvedValue(file('note', 'Note.md', 'created'));
    mocks.moveDriveFile.mockReturnValue(moveResponse.promise);

    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let note!: VaultNode;
    let destination!: VaultNode;
    await act(async () => {
      note = await result.current.createNote(null, 'Note');
      destination = await result.current.createFolder(null, 'Folder');
    });

    let movePromise!: Promise<VaultNode>;
    act(() => {
      movePromise = result.current.moveNode(note, destination);
    });
    expect(result.current.tree[0]?.children?.[0]).toEqual(
      expect.objectContaining({ id: 'note', path: 'Folder/Note.md' }),
    );

    moveResponse.resolve({ ...file('note', 'Note.md', 'moved'), parents: ['folder'] });
    await act(async () => movePromise);
  });

  it('rejects moving a folder into itself or a descendant without changing Drive', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let parent!: VaultNode;
    let child!: VaultNode;
    await act(async () => {
      parent = await result.current.createFolder(null, 'Folder');
      child = await result.current.createFolder(parent, 'Nested');
    });

    await expect(result.current.moveNode(parent, parent)).rejects.toThrow('itself');
    await expect(result.current.moveNode(parent, child)).rejects.toThrow('descendants');
    expect(mocks.moveDriveFile).not.toHaveBeenCalled();
  });

  it('keeps the original tree when Drive rejects a move', async () => {
    mocks.createDriveFolder.mockReset();
    mocks.createDriveFolder.mockResolvedValue(folder('folder', 'Folder'));
    mocks.createDriveMarkdownFile.mockResolvedValue(file('note', 'Note.md', 'created'));
    mocks.moveDriveFile.mockRejectedValue(new Error('Drive move failed'));

    const wrapper = ({ children }: { children: ReactNode }) => <VaultProvider>{children}</VaultProvider>;
    const { result } = renderHook(() => useVault(), { wrapper });

    let note!: VaultNode;
    let destination!: VaultNode;
    await act(async () => {
      note = await result.current.createNote(null, 'Note');
      destination = await result.current.createFolder(null, 'Folder');
    });
    const originalTree = result.current.tree;

    await expect(result.current.moveNode(note, destination)).rejects.toThrow('Drive move failed');
    expect(result.current.tree).toEqual(originalTree);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function file(id: string, name: string, modifiedTime: string): DriveFile {
  return { id, mimeType: 'text/markdown', modifiedTime, name, parents: ['vault'] };
}

function folder(id: string, name: string, parent = 'vault'): DriveFile {
  return {
    id,
    mimeType: 'application/vnd.google-apps.folder',
    modifiedTime: 'created',
    name,
    parents: [parent],
  };
}
