import type { VaultNode } from '../types/vault';
import { type CachedNoteContentRecord, type CachedVaultRecord, getVaultCacheDatabase } from './indexedDb';

export async function getVaultTree(accountId: string, vaultId: string) {
  return safelyRead(async () => {
    const database = await getVaultCacheDatabase();
    const record = await database.get('vaults', [accountId, vaultId]);
    return isCachedVaultRecord(record) ? record : null;
  }, null);
}

export async function putVaultTree(record: CachedVaultRecord) {
  await safelyWrite(async () => {
    const database = await getVaultCacheDatabase();
    await database.put('vaults', record);
  });
}

export async function deleteVault(accountId: string, vaultId: string) {
  await safelyWrite(async () => {
    const database = await getVaultCacheDatabase();
    const transaction = database.transaction(['vaults', 'noteContents'], 'readwrite');
    await transaction.objectStore('vaults').delete([accountId, vaultId]);

    const noteKeys = await transaction.objectStore('noteContents').index('by-vault').getAllKeys([accountId, vaultId]);
    await Promise.all(noteKeys.map((key) => transaction.objectStore('noteContents').delete(key)));
    await transaction.done;
  });
}

export async function getNoteContent(accountId: string, vaultId: string, fileId: string) {
  return safelyRead(async () => {
    const database = await getVaultCacheDatabase();
    const record = await database.get('noteContents', [accountId, vaultId, fileId]);
    return isCachedNoteContentRecord(record) ? record : null;
  }, null);
}

export async function putNoteContent(record: CachedNoteContentRecord) {
  await safelyWrite(async () => {
    const database = await getVaultCacheDatabase();
    await database.put('noteContents', record);
  });
}

export async function deleteNoteContent(accountId: string, vaultId: string, fileId: string) {
  await safelyWrite(async () => {
    const database = await getVaultCacheDatabase();
    await database.delete('noteContents', [accountId, vaultId, fileId]);
  });
}

export async function updateNoteContentVersion(
  accountId: string,
  vaultId: string,
  fileId: string,
  modifiedTime?: string,
) {
  const cachedNote = await getNoteContent(accountId, vaultId, fileId);
  if (!cachedNote) return;

  await putNoteContent({ ...cachedNote, modifiedTime, cachedAt: Date.now() });
}

export async function deleteMissingNoteContents(
  accountId: string,
  vaultId: string,
  validFileIds: Set<string>,
) {
  await safelyWrite(async () => {
    const database = await getVaultCacheDatabase();
    const transaction = database.transaction('noteContents', 'readwrite');
    const store = transaction.objectStore('noteContents');
    const keys = await store.index('by-vault').getAllKeys([accountId, vaultId]);

    await Promise.all(keys.filter((key) => !validFileIds.has(key[2])).map((key) => store.delete(key)));
    await transaction.done;
  });
}

export async function deleteAccountCache(accountId: string) {
  await safelyWrite(async () => {
    const database = await getVaultCacheDatabase();
    const transaction = database.transaction(['vaults', 'noteContents'], 'readwrite');
    const vaultStore = transaction.objectStore('vaults');
    const noteStore = transaction.objectStore('noteContents');
    const [vaultKeys, noteKeys] = await Promise.all([
      vaultStore.index('by-account').getAllKeys(accountId),
      noteStore.index('by-account').getAllKeys(accountId),
    ]);

    await Promise.all([
      ...vaultKeys.map((key) => vaultStore.delete(key)),
      ...noteKeys.map((key) => noteStore.delete(key)),
    ]);
    await transaction.done;
  });
}

export function createCachedVaultRecord(
  accountId: string,
  vaultId: string,
  vaultName: string,
  tree: VaultNode[],
): CachedVaultRecord {
  return { accountId, vaultId, vaultName, tree, syncedAt: Date.now() };
}

async function safelyRead<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    warnAboutCacheFailure(error);
    return fallback;
  }
}

async function safelyWrite(operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    warnAboutCacheFailure(error);
  }
}

function warnAboutCacheFailure(error: unknown) {
  console.warn('[vault cache] IndexedDB operation failed; continuing without cache.', error);
}

function isCachedVaultRecord(value: unknown): value is CachedVaultRecord {
  if (!isObject(value)) return false;

  return (
    typeof value.accountId === 'string' &&
    typeof value.vaultId === 'string' &&
    typeof value.vaultName === 'string' &&
    typeof value.syncedAt === 'number' &&
    Array.isArray(value.tree) &&
    value.tree.every(isVaultNode)
  );
}

function isCachedNoteContentRecord(value: unknown): value is CachedNoteContentRecord {
  if (!isObject(value)) return false;

  return (
    typeof value.accountId === 'string' &&
    typeof value.vaultId === 'string' &&
    typeof value.fileId === 'string' &&
    typeof value.content === 'string' &&
    typeof value.cachedAt === 'number' &&
    (value.modifiedTime === undefined || typeof value.modifiedTime === 'string')
  );
}

function isVaultNode(value: unknown): value is VaultNode {
  if (!isObject(value) || !isObject(value.source)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.path === 'string' &&
    typeof value.mimeType === 'string' &&
    (value.type === 'folder' || value.type === 'markdown' || value.type === 'other') &&
    (value.children === undefined || (Array.isArray(value.children) && value.children.every(isVaultNode))) &&
    typeof value.source.id === 'string' &&
    typeof value.source.name === 'string' &&
    typeof value.source.mimeType === 'string'
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
