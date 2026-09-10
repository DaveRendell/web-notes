import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../types/vault';
import {
  closeVaultCacheDatabase,
  getVaultCacheDatabase,
  VAULT_CACHE_DATABASE_NAME,
  VAULT_CACHE_DATABASE_VERSION,
} from './indexedDb';
import {
  createCachedVaultRecord,
  deleteAccountCache,
  deleteMissingNoteContents,
  deleteNoteContent,
  deleteVault,
  getNoteContent,
  getNoteIcons,
  getVaultTree,
  putNoteContent,
  putNoteIcon,
  putVaultTree,
  updateNoteContentVersion,
} from './vaultCache';

const note = (id: string): VaultNode => ({
  id,
  mimeType: 'text/markdown',
  name: `${id}.md`,
  path: `${id}.md`,
  source: { id, mimeType: 'text/markdown', name: `${id}.md`, modifiedTime: '2026-01-01T00:00:00Z' },
  type: 'markdown',
});

beforeEach(async () => {
  await closeVaultCacheDatabase();
  await deleteDatabase();
});

afterEach(async () => {
  await closeVaultCacheDatabase();
});

describe('vault cache database', () => {
  it('creates both stores and upgrades an older vault-only database', async () => {
    const oldDatabase = await openDB(VAULT_CACHE_DATABASE_NAME, 1, {
      upgrade(database) {
        const store = database.createObjectStore('vaults', { keyPath: ['accountId', 'vaultId'] });
        store.createIndex('by-account', 'accountId');
      },
    });
    oldDatabase.close();

    const database = await getVaultCacheDatabase();

    expect(database.version).toBe(VAULT_CACHE_DATABASE_VERSION);
    expect([...database.objectStoreNames]).toEqual(['images', 'noteContents', 'noteIcons', 'vaults']);
  });

  it('stores typed vault trees and note bodies with compound-key isolation', async () => {
    await putVaultTree(createCachedVaultRecord('account-a', 'vault-1', 'One', [note('a')]));
    await putVaultTree(createCachedVaultRecord('account-b', 'vault-1', 'Other user', [note('b')]));
    await putNoteContent({
      accountId: 'account-a',
      vaultId: 'vault-1',
      fileId: 'shared-id',
      content: 'account A',
      modifiedTime: 'v1',
      cachedAt: 1,
    });
    await putNoteContent({
      accountId: 'account-b',
      vaultId: 'vault-1',
      fileId: 'shared-id',
      content: 'account B',
      modifiedTime: 'v1',
      cachedAt: 2,
    });

    expect((await getVaultTree('account-a', 'vault-1'))?.tree[0].id).toBe('a');
    expect((await getVaultTree('account-b', 'vault-1'))?.tree[0].id).toBe('b');
    expect((await getNoteContent('account-a', 'vault-1', 'shared-id'))?.content).toBe('account A');
    expect((await getNoteContent('account-b', 'vault-1', 'shared-id'))?.content).toBe('account B');
    expect(await getNoteContent('account-a', 'missing', 'shared-id')).toBeNull();
  });

  it('updates versions, prunes missing files, and supports targeted deletion', async () => {
    for (const fileId of ['keep', 'remove']) {
      await putNoteContent({
        accountId: 'account-a',
        vaultId: 'vault-1',
        fileId,
        content: fileId,
        modifiedTime: 'old',
        cachedAt: 1,
      });
    }
    await putNoteContent({
      accountId: 'account-a',
      vaultId: 'vault-2',
      fileId: 'other-vault',
      content: 'safe',
      cachedAt: 1,
    });

    await updateNoteContentVersion('account-a', 'vault-1', 'keep', 'new');
    await deleteMissingNoteContents('account-a', 'vault-1', new Set(['keep']));

    expect((await getNoteContent('account-a', 'vault-1', 'keep'))?.modifiedTime).toBe('new');
    expect(await getNoteContent('account-a', 'vault-1', 'remove')).toBeNull();
    expect(await getNoteContent('account-a', 'vault-2', 'other-vault')).not.toBeNull();

    await deleteNoteContent('account-a', 'vault-1', 'keep');
    expect(await getNoteContent('account-a', 'vault-1', 'keep')).toBeNull();
  });

  it('stores note icons separately from note bodies and prunes them with missing notes', async () => {
    await putNoteIcon({
      accountId: 'account-a',
      vaultId: 'vault-1',
      fileId: 'emoji',
      emoji: '📝',
      cachedAt: 1,
    });
    await putNoteIcon({
      accountId: 'account-a',
      vaultId: 'vault-1',
      fileId: 'plain',
      emoji: null,
      cachedAt: 2,
    });
    await putNoteIcon({
      accountId: 'account-b',
      vaultId: 'vault-1',
      fileId: 'emoji',
      emoji: '🔒',
      cachedAt: 3,
    });

    expect(await getNoteIcons('account-a', 'vault-1')).toEqual([
      expect.objectContaining({ emoji: '📝', fileId: 'emoji' }),
      expect.objectContaining({ emoji: null, fileId: 'plain' }),
    ]);

    await deleteMissingNoteContents('account-a', 'vault-1', new Set(['emoji']));
    expect(await getNoteIcons('account-a', 'vault-1')).toEqual([
      expect.objectContaining({ emoji: '📝', fileId: 'emoji' }),
    ]);
    expect(await getNoteIcons('account-b', 'vault-1')).toHaveLength(1);

    await deleteNoteContent('account-a', 'vault-1', 'emoji');
    expect(await getNoteIcons('account-a', 'vault-1')).toEqual([]);
  });

  it('deletes one vault or every record for one account without crossing account boundaries', async () => {
    for (const accountId of ['account-a', 'account-b']) {
      for (const vaultId of ['vault-1', 'vault-2']) {
        await putVaultTree(createCachedVaultRecord(accountId, vaultId, vaultId, [note(`${accountId}-${vaultId}`)]));
        await putNoteContent({ accountId, vaultId, fileId: 'note', content: 'body', cachedAt: 1 });
        await putNoteIcon({ accountId, vaultId, fileId: 'note', emoji: '📝', cachedAt: 1 });
      }
    }

    await deleteVault('account-a', 'vault-1');
    expect(await getVaultTree('account-a', 'vault-1')).toBeNull();
    expect(await getNoteContent('account-a', 'vault-1', 'note')).toBeNull();
    expect(await getNoteIcons('account-a', 'vault-1')).toEqual([]);
    expect(await getVaultTree('account-a', 'vault-2')).not.toBeNull();

    await deleteAccountCache('account-a');
    expect(await getVaultTree('account-a', 'vault-2')).toBeNull();
    expect(await getNoteContent('account-a', 'vault-2', 'note')).toBeNull();
    expect(await getNoteIcons('account-a', 'vault-2')).toEqual([]);
    expect(await getVaultTree('account-b', 'vault-1')).not.toBeNull();
    expect(await getNoteContent('account-b', 'vault-2', 'note')).not.toBeNull();
    expect(await getNoteIcons('account-b', 'vault-2')).toHaveLength(1);
  });

  it('ignores malformed records instead of exposing invalid cache data', async () => {
    const database = await getVaultCacheDatabase();
    await database.put('vaults', {
      accountId: 'account-a',
      vaultId: 'broken',
      vaultName: 'Broken',
      tree: [{ id: 42 }],
      syncedAt: Date.now(),
    } as never);
    await database.put('noteContents', {
      accountId: 'account-a',
      vaultId: 'vault-1',
      fileId: 'broken',
      content: 42,
      cachedAt: Date.now(),
    } as never);

    expect(await getVaultTree('account-a', 'broken')).toBeNull();
    expect(await getNoteContent('account-a', 'vault-1', 'broken')).toBeNull();
  });

  it('treats IndexedDB failures as non-fatal cache misses', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = new DOMException('Quota exceeded', 'QuotaExceededError');
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw failure;
    });

    await expect(getVaultTree('account-a', 'vault-1')).resolves.toBeNull();
    expect(warning).toHaveBeenCalledWith(
      '[vault cache] IndexedDB operation failed; continuing without cache.',
      failure,
    );
  });
});

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(VAULT_CACHE_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion was blocked.'));
  });
}
