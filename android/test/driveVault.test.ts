import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  user: 'google-user',
  children: vi.fn(), text: vi.fn(), update: vi.fn(),
  createNote: vi.fn(), createFolder: vi.fn(), find: vi.fn(),
}));
vi.mock('../mobileCache', () => ({ mobileCache: {
  get: async (key: string, validate: (value: unknown) => boolean) => { const value = mocks.storage.get(key); return validate(value) ? value : null; },
  getRequired: async (key: string, validate: (value: unknown) => boolean) => { const value = mocks.storage.get(key); if (value === undefined) return null; if (!validate(value)) throw new Error('Invalid local data'); return value; },
  put: async (key: string, value: unknown) => { mocks.storage.set(key, value); },
  putRequired: async (key: string, value: unknown) => { mocks.storage.set(key, value); },
  delete: async (key: string) => { mocks.storage.delete(key); },
} }));
vi.mock('../driveAuth', () => ({
  connectDrive: async () => ({ accountId: 'account', googleUserId: mocks.user }),
  restoreDriveUser: async () => mocks.user,
  withDriveToken: async (operation: (token: string) => unknown) => operation('token'),
}));
vi.mock('../mobilePreferences', () => ({}));
vi.mock('../../web/src/lib/googleDrive', async (original) => ({
  ...await original<typeof import('../../web/src/lib/googleDrive')>(),
  listDriveChildren: mocks.children,
  getDriveFileText: mocks.text,
  updateDriveFileText: mocks.update,
  createDriveMarkdownFile: mocks.createNote,
  createDriveFolder: mocks.createFolder,
  findDriveChildByName: mocks.find,
}));

import { createFolder, createNote, listVault, overwritePendingNote, readNote, readVaultFavourites, readVaultListCache, restoreVault, saveNote, selectDriveVault, syncPendingWrites, writeVaultListCache } from '../driveVault';
import { bodyMatches, driveItem, driveUri, parseDriveUri, queueWrite } from '../driveVaultCore';

const account = { accountId: 'account', googleUserId: 'google-user' };
const root = 'drive:account:vault:vault';
const uri = 'drive:account:vault:note';
const file = { id: 'note', name: 'Note.md', mimeType: 'text/markdown', modifiedTime: 'v1' };
const item = driveItem(file, parseDriveUri(root), '')!;

beforeEach(async () => {
  vi.clearAllMocks(); mocks.storage.clear(); mocks.user = account.googleUserId;
  mocks.children.mockResolvedValue([file]); mocks.text.mockResolvedValue('original');
  mocks.update.mockResolvedValue({ ...file, modifiedTime: 'v2' });
  mocks.find.mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => file })));
  await selectDriveVault(account, 'vault');
  await writeVaultListCache(root, [item], true);
});

describe('Drive vault native cache and sync', () => {
  it('restores only the signed-in account and rejects cross-account reads', async () => {
    expect(await restoreVault()).toBe(root);
    mocks.user = 'other-user';
    expect(await restoreVault()).toBeNull();
    await expect(readVaultListCache(root)).rejects.toThrow('Reconnect');
  });
  it('displays the cached listing before a network refresh', async () => {
    expect((await readVaultListCache(root))?.items).toEqual([item]);
    expect(mocks.children).not.toHaveBeenCalled();
  });
  it('skips matching cached body requests', async () => {
    mocks.storage.set(`body:${uri}`, { content: 'cached', modifiedTime: 'v1' });
    expect(await readNote(uri)).toBe('cached');
    expect(mocks.text).not.toHaveBeenCalled();
  });
  it('downloads cache misses and confirms their metadata', async () => {
    expect(await readNote(uri)).toBe('original');
    expect(mocks.storage.get(`body:${uri}`)).toEqual({ content: 'original', modifiedTime: 'v1' });
  });
  it('shows stale cached content and then updates it', async () => {
    mocks.storage.set(`body:${uri}`, { content: 'cached', modifiedTime: 'old' });
    const refresh = vi.fn();
    expect(await readNote(uri, refresh)).toBe('cached');
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith('original'));
  });
  it('retains cached content when its refresh fails', async () => {
    mocks.storage.set(`body:${uri}`, { content: 'cached' });
    mocks.text.mockRejectedValue(new TypeError('Network request failed'));
    const error = vi.fn();
    expect(await readNote(uri, vi.fn(), error)).toBe('cached');
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });
  it('does not prune after an incomplete listing', async () => {
    const folder = { id: 'folder', name: 'Folder', mimeType: 'application/vnd.google-apps.folder' };
    mocks.storage.set(`body:${uri}`, { content: 'cached' });
    mocks.children.mockResolvedValueOnce([folder]).mockRejectedValueOnce(new Error('Failed listing'));
    await expect(listVault(root)).rejects.toThrow('Failed listing');
    expect(mocks.storage.has(`body:${uri}`)).toBe(true);
    expect((await readVaultListCache(root))?.items).toEqual([item]);
  });
  it('prunes deleted bodies only after a complete listing', async () => {
    mocks.storage.set(`body:${uri}`, { content: 'cached' });
    mocks.children.mockResolvedValue([]);
    await listVault(root);
    expect(mocks.storage.has(`body:${uri}`)).toBe(false);
  });
  it('persists offline edits and coalesces successive snapshots without losing the original baseline', async () => {
    mocks.text.mockRejectedValue(new TypeError('Network request failed'));
    await saveNote(uri, 'original', 'first edit');
    await saveNote(uri, 'first edit', 'latest edit');
    expect(await readNote(uri)).toBe('latest edit');
    expect(mocks.storage.get(`writes:${root}`)).toEqual([{ uri, original: 'original', content: 'latest edit' }]);
    mocks.text.mockResolvedValue('original');
    await syncPendingWrites(root);
    expect(mocks.update).toHaveBeenCalledWith('token', 'note', 'latest edit');
    expect(mocks.storage.get(`writes:${root}`)).toEqual([]);
    expect(mocks.storage.get(`body:${uri}`)).toEqual({ content: 'latest edit', modifiedTime: 'v2' });
  });
  it('preserves conflicted offline edits and does not overwrite Drive without consent', async () => {
    mocks.text.mockResolvedValue('remote edit');
    await expect(saveNote(uri, 'original', 'local edit')).rejects.toThrow('changed on Google Drive');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(await readNote(uri)).toBe('local edit');
    await overwritePendingNote(uri);
    expect(mocks.update).toHaveBeenCalledWith('token', 'note', 'local edit');
    expect(mocks.storage.get(`writes:${root}`)).toEqual([]);
  });
  it('recovers a write committed remotely before an ambiguous response without writing twice', async () => {
    mocks.text.mockResolvedValue('local edit');
    await saveNote(uri, 'original', 'local edit');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.storage.get(`writes:${root}`)).toEqual([]);
  });
  it('does not report an unrelated unsaved note as successfully conflict-resolved', async () => {
    await expect(overwritePendingNote(uri, 'unsaved draft')).rejects.toThrow('no pending local save');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('keeps pending edits even if the remote file disappears', async () => {
    mocks.text.mockRejectedValue(new TypeError('Network request failed'));
    await saveNote(uri, 'original', 'local edit');
    mocks.children.mockResolvedValue([]);
    await listVault(root);
    expect(await readNote(uri)).toBe('local edit');
    expect((await readVaultListCache(root))?.items.some((entry) => entry.uri === uri)).toBe(true);
  });
  it('does not lose durable drafts when the queue is malformed', async () => {
    mocks.storage.set(`writes:${root}`, [{ content: 'precious draft' }]);
    await expect(saveNote(uri, 'original', 'replacement')).rejects.toThrow('Invalid local data');
    expect(mocks.storage.get(`writes:${root}`)).toEqual([{ content: 'precious draft' }]);
  });
  it('does not let one conflict prevent another queued note from syncing', async () => {
    const other = 'drive:account:vault:other';
    mocks.storage.set(`writes:${root}`, [{ uri, original: 'original', content: 'local' }, { uri: other, original: 'original', content: 'other edit' }]);
    mocks.text.mockImplementation(async (_token: string, id: string) => id === 'note' ? 'remote change' : 'original');
    await syncPendingWrites(root);
    expect(mocks.storage.get(`writes:${root}`)).toEqual([{ uri, original: 'original', content: 'local' }]);
    expect(mocks.update).toHaveBeenCalledWith('token', 'other', 'other edit');
  });
  it('does not label a changing download with an incorrect version', async () => {
    let version = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...file, modifiedTime: String(version++) }) })));
    await expect(readNote(uri)).rejects.toThrow('changing on Drive');
    expect(mocks.storage.has(`body:${uri}`)).toBe(false);
  });
  it('validates missing timestamps rather than assuming a cache hit', async () => {
    mocks.storage.set(`body:${uri}`, { content: 'cached' });
    expect(await readNote(uri)).toBe('original');
    expect(mocks.text).toHaveBeenCalled();
  });
  it('leaves a newer local snapshot untouched when a stale background download finishes', async () => {
    mocks.storage.set(`body:${uri}`, { content: 'old cache' });
    let release!: (value: string) => void;
    const download = new Promise<string>((resolve) => { release = resolve; });
    mocks.text.mockReturnValueOnce(download).mockRejectedValue(new TypeError('Network request failed'));
    const refresh = vi.fn();
    expect(await readNote(uri, refresh)).toBe('old cache');
    await vi.waitFor(() => expect(mocks.text).toHaveBeenCalled());
    await saveNote(uri, 'old cache', 'local edit');
    release('stale download');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(refresh).not.toHaveBeenCalled();
    expect(await readNote(uri)).toBe('local edit');
  });
  it('updates tree and content cache after note creation', async () => {
    mocks.createNote.mockResolvedValue({ ...file, id: 'new', name: 'New.md' });
    const note = await createNote(root, '', 'New');
    expect((await readVaultListCache(root))?.items.some((entry) => entry.uri === note.uri)).toBe(true);
    expect(await readNote(note.uri)).toBe('');
  });
  it('updates tree after folder creation', async () => {
    mocks.createFolder.mockResolvedValue({ id: 'folder', name: 'Folder', mimeType: 'application/vnd.google-apps.folder' });
    expect((await createFolder(root, '', 'Folder')).kind).toBe('folder');
    expect((await readVaultListCache(root))?.items).toHaveLength(2);
  });
  it('loads ordered Drive IDs directly, even before the notes are listed', async () => {
    mocks.find.mockResolvedValue({ id: 'settings' });
    mocks.text.mockResolvedValue(JSON.stringify({ version: 1, favourites: ['unlisted', 'note'] }));
    expect(await readVaultFavourites(root)).toEqual(['unlisted', 'note']);
    mocks.find.mockRejectedValue(new TypeError('Network request failed'));
    expect(await readVaultFavourites(root)).toEqual(['unlisted', 'note']);
  });
  it('shows cached favourites before a slow Drive refresh and applies the updated order', async () => {
    mocks.storage.set(`favourite-ids:${root}`, ['note']);
    let resolve!: (value: unknown) => void;
    mocks.find.mockReturnValue(new Promise((done) => { resolve = done; }));
    mocks.text.mockResolvedValue(JSON.stringify({ version: 1, favourites: ['other', 'note'] }));
    const refreshed = vi.fn();
    expect(await readVaultFavourites(root, refreshed)).toEqual(['note']);
    expect(refreshed).not.toHaveBeenCalled();
    resolve({ id: 'settings' });
    await vi.waitFor(() => expect(refreshed).toHaveBeenCalledWith(['other', 'note']));
    expect(mocks.storage.get(`favourite-ids:${root}`)).toEqual(['other', 'note']);
  });
  it('isolates cached favourites by vault and account', async () => {
    mocks.storage.set(`favourite-ids:${root}`, ['secret']);
    const other = 'drive:account:other:other';
    await selectDriveVault(account, 'other');
    expect(await readVaultFavourites(other)).toEqual([]);
    await selectDriveVault(account, 'vault');
    mocks.user = 'another-account';
    await expect(readVaultFavourites(root)).rejects.toThrow('Reconnect');
  });
});

describe('Drive cache pure helpers', () => {
  it('isolates account, vault and file in locators', () => {
    const location = { accountId: 'a:b', vaultId: 'v', fileId: 'f' };
    expect(parseDriveUri(driveUri(location))).toEqual(location);
    expect(() => parseDriveUri('content://phone')).toThrow();
  });
  it('requires both timestamps for a cache hit', () => {
    expect(bodyMatches({ content: '' }, undefined)).toBe(false);
    expect(bodyMatches({ content: '', modifiedTime: 'v1' }, 'v2')).toBe(false);
  });
  it('retains the remote baseline when queueing subsequent edits', () => {
    expect(queueWrite([{ uri, original: 'remote', content: 'one' }], { uri, original: 'one', content: 'two' })).toEqual([{ uri, original: 'remote', content: 'two' }]);
  });
});
