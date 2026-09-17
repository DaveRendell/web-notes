import { forceCloseDatabase } from 'fake-indexeddb';
import { deleteDB, openDB, unwrap } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeVaultCacheDatabase,
  getVaultCacheDatabase,
  VAULT_CACHE_DATABASE_NAME,
  VAULT_CACHE_DATABASE_VERSION,
} from './indexedDb';

beforeEach(async () => {
  await closeVaultCacheDatabase();
  await deleteDB(VAULT_CACHE_DATABASE_NAME);
});

afterEach(async () => {
  await closeVaultCacheDatabase();
  await deleteDB(VAULT_CACHE_DATABASE_NAME);
  vi.restoreAllMocks();
});

describe('cache connection lifecycle', () => {
  it('shares one connection between concurrent callers', async () => {
    const first = getVaultCacheDatabase();
    expect(getVaultCacheDatabase()).toBe(first);
    expect(await getVaultCacheDatabase()).toBe(await first);
  });

  it('releases the old connection so another tab can upgrade without being blocked', async () => {
    const old = await getVaultCacheDatabase();
    const blocked = vi.fn();
    const upgraded = await openDB(VAULT_CACHE_DATABASE_NAME, VAULT_CACHE_DATABASE_VERSION + 1, { blocked });
    try {
      expect(blocked).not.toHaveBeenCalled();
      expect(() => old.transaction('vaults')).toThrow();
      // Old app code cannot read a newer schema; callers receive the normal
      // version error (handled by the cache facade), not a closed connection.
      await expect(getVaultCacheDatabase()).rejects.toMatchObject({ name: 'VersionError' });
    } finally {
      upgraded.close();
    }
  });

  it('releases the connection for deletion and opens a fresh database afterwards', async () => {
    const old = await getVaultCacheDatabase();
    const blocked = vi.fn();
    await deleteDB(VAULT_CACHE_DATABASE_NAME, { blocked });
    expect(blocked).not.toHaveBeenCalled();
    const fresh = await getVaultCacheDatabase();
    expect(fresh).not.toBe(old);
    expect([...fresh.objectStoreNames]).toEqual(['images', 'noteContents', 'noteIcons', 'vaults']);
  });

  it('reconnects after an unexpected browser termination', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = await getVaultCacheDatabase();
    const nativeDatabase = unwrap(old);
    const closed = new Promise<void>((resolve) => nativeDatabase.addEventListener('close', () => resolve(), { once: true }));
    // fake-indexeddb's declaration incorrectly accepts the constructor type;
    // its runtime API takes an open database instance.
    forceCloseDatabase(nativeDatabase as unknown as Parameters<typeof forceCloseDatabase>[0]);
    await closed;
    const fresh = await getVaultCacheDatabase();
    expect(fresh).not.toBe(old);
    expect(await fresh.count('vaults')).toBe(0);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('closed unexpectedly'));
  });
});
