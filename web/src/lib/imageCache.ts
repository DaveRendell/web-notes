import { getVaultCacheDatabase } from './indexedDb';

// Bound persistent image storage independently of the much smaller note cache.
const MAX_BYTES = 100 * 1024 * 1024;

export async function getCachedImage(accountId: string, vaultId: string, fileId: string, modifiedTime?: string) {
  if (!modifiedTime) return null;
  try {
    const db = await getVaultCacheDatabase();
    const record = await db.get('images', [accountId, vaultId, fileId]);
    return record?.modifiedTime === modifiedTime && record.blob instanceof Blob ? record.blob : null;
  } catch (error) {
    console.warn('[image cache] Read failed; downloading instead.', error);
    return null;
  }
}

export async function putCachedImage(accountId: string, vaultId: string, fileId: string, modifiedTime: string | undefined, blob: Blob) {
  if (!modifiedTime || blob.size > MAX_BYTES) return;
  try {
    const db = await getVaultCacheDatabase();
    const tx = db.transaction('images', 'readwrite');
    await tx.store.put({ accountId, vaultId, fileId, modifiedTime, blob, cachedAt: Date.now() });
    const records = await tx.store.getAll();
    let bytes = records.reduce((sum, record) => sum + record.blob.size, 0);
    for (const record of records.sort((a, b) => a.cachedAt - b.cachedAt)) {
      if (bytes <= MAX_BYTES) break;
      await tx.store.delete([record.accountId, record.vaultId, record.fileId]);
      bytes -= record.blob.size;
    }
    await tx.done;
  } catch (error) {
    console.warn('[image cache] Write failed; continuing without cache.', error);
  }
}
