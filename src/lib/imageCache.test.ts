import { deleteDB } from 'idb';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { closeVaultCacheDatabase, getVaultCacheDatabase, VAULT_CACHE_DATABASE_NAME } from './indexedDb';
import { getCachedImage, putCachedImage } from './imageCache';
import { deleteAccountCache, deleteVault } from './vaultCache';

beforeEach(async () => {
  // jsdom's Blob is not supported by Node's structuredClone used by fake-indexeddb.
  const { Blob } = await vi.importActual<{ Blob: typeof globalThis.Blob }>('node:buffer');
  vi.stubGlobal('Blob', Blob);
  await closeVaultCacheDatabase();
  await deleteDB(VAULT_CACHE_DATABASE_NAME);
});
afterEach(async () => {
  await closeVaultCacheDatabase();
  await deleteDB(VAULT_CACHE_DATABASE_NAME);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('treats unavailable storage as a non-fatal cache miss', async () => {
  const db = await getVaultCacheDatabase();
  vi.spyOn(db, 'get').mockRejectedValue(new Error('unavailable'));
  vi.spyOn(db, 'transaction').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await getCachedImage('a', 'v', 'f', '1')).toBeNull();
  await expect(putCachedImage('a', 'v', 'f', '1', new globalThis.Blob(['image']))).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(2);
});
it('persists blobs across connections and validates versions and scope', async () => {
  await putCachedImage('a', 'v', 'f', '1', new globalThis.Blob(['image']));
  await closeVaultCacheDatabase();
  expect(await (await getCachedImage('a', 'v', 'f', '1'))?.text()).toBe('image');
  expect(await getCachedImage('a', 'v', 'f', '2')).toBeNull();
  expect(await getCachedImage('a', 'v', 'f')).toBeNull();
  expect(await getCachedImage('b', 'v', 'f', '1')).toBeNull();
  expect(await getCachedImage('a', 'other', 'f', '1')).toBeNull();
});
it('cleans images on vault deletion and disconnect without affecting other accounts', async () => {
  for (const account of ['a', 'b']) {
    for (const vault of ['v', 'w']) await putCachedImage(account, vault, 'f', '1', new globalThis.Blob(['image']));
  }
  await deleteVault('a', 'v');
  expect(await getCachedImage('a', 'v', 'f', '1')).toBeNull();
  expect(await getCachedImage('a', 'w', 'f', '1')).not.toBeNull();
  await deleteAccountCache('a');
  expect(await getCachedImage('a', 'w', 'f', '1')).toBeNull();
  expect(await getCachedImage('b', 'v', 'f', '1')).not.toBeNull();
});
