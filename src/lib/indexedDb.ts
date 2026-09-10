import { deleteDB, type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { VaultNode } from '../types/vault';

export const VAULT_CACHE_DATABASE_NAME = 'web-notes';
export const VAULT_CACHE_DATABASE_VERSION = 4;
const LEGACY_VAULT_CACHE_DATABASE_NAME = 'vault-web-viewer';

export type CachedVaultRecord = {
  accountId: string;
  vaultId: string;
  vaultName: string;
  tree: VaultNode[];
  syncedAt: number;
};

export type CachedNoteContentRecord = {
  accountId: string;
  vaultId: string;
  fileId: string;
  content: string;
  modifiedTime?: string;
  cachedAt: number;
};

export type CachedNoteIconRecord = {
  accountId: string;
  vaultId: string;
  fileId: string;
  emoji: string | null;
  cachedAt: number;
};

interface VaultCacheSchema extends DBSchema {
  images: {
    key: [string, string, string];
    value: { accountId: string; vaultId: string; fileId: string; modifiedTime: string; blob: Blob; cachedAt: number };
    indexes: { 'by-account': string; 'by-vault': [string, string] };
  };
  vaults: {
    key: [string, string];
    value: CachedVaultRecord;
    indexes: { 'by-account': string };
  };
  noteContents: {
    key: [string, string, string];
    value: CachedNoteContentRecord;
    indexes: {
      'by-account': string;
      'by-vault': [string, string];
    };
  };
  noteIcons: {
    key: [string, string, string];
    value: CachedNoteIconRecord;
    indexes: {
      'by-account': string;
      'by-vault': [string, string];
    };
  };
}

let databasePromise: Promise<IDBPDatabase<VaultCacheSchema>> | null = null;

export function getVaultCacheDatabase() {
  if (!databasePromise) {
    const openingDatabase = openVaultCacheDatabase(() => {
      // An older connection must never clear a newer singleton.
      if (databasePromise === openingDatabase) databasePromise = null;
    });
    databasePromise = openingDatabase;

    void openingDatabase.catch(() => {
      if (databasePromise === openingDatabase) databasePromise = null;
    });
  }

  return databasePromise;
}

async function openVaultCacheDatabase(invalidate: () => void) {
  const database = await openDB<VaultCacheSchema>(VAULT_CACHE_DATABASE_NAME, VAULT_CACHE_DATABASE_VERSION, {
    blocking(_currentVersion, _blockedVersion, event) {
      // Release this tab's connection immediately so another tab can upgrade
      // or delete the cache. Existing transactions are allowed to finish.
      (event.target as IDBDatabase).close();
      invalidate();
    },
    terminated() {
      invalidate();
      console.warn('[vault cache] Database connection closed unexpectedly; the next cache operation will reconnect.');
    },
    blocked() {
      console.warn('[vault cache] Database upgrade is waiting for another tab to release its connection.');
    },
    upgrade(database) {
      if (!database.objectStoreNames.contains('images')) {
        const images = database.createObjectStore('images', { keyPath: ['accountId', 'vaultId', 'fileId'] });
        images.createIndex('by-account', 'accountId');
        images.createIndex('by-vault', ['accountId', 'vaultId']);
      }
      if (!database.objectStoreNames.contains('vaults')) {
        const vaultStore = database.createObjectStore('vaults', { keyPath: ['accountId', 'vaultId'] });
        vaultStore.createIndex('by-account', 'accountId');
      }

      if (!database.objectStoreNames.contains('noteContents')) {
        const noteStore = database.createObjectStore('noteContents', {
          keyPath: ['accountId', 'vaultId', 'fileId'],
        });
        noteStore.createIndex('by-account', 'accountId');
        noteStore.createIndex('by-vault', ['accountId', 'vaultId']);
      }

      if (!database.objectStoreNames.contains('noteIcons')) {
        const iconStore = database.createObjectStore('noteIcons', {
          keyPath: ['accountId', 'vaultId', 'fileId'],
        });
        iconStore.createIndex('by-account', 'accountId');
        iconStore.createIndex('by-vault', ['accountId', 'vaultId']);
      }
    },
  });

  try {
    await migrateLegacyVaultCache(database);
  } catch (error) {
    console.warn('[vault cache] Failed to migrate the legacy cache; continuing with the new cache.', error);
  }

  return database;
}

async function migrateLegacyVaultCache(database: IDBPDatabase<VaultCacheSchema>) {
  if (!indexedDB.databases) return;

  const databases = await indexedDB.databases();
  if (!databases.some(({ name }) => name === LEGACY_VAULT_CACHE_DATABASE_NAME)) return;

  const legacyDatabase = await openDB<VaultCacheSchema>(LEGACY_VAULT_CACHE_DATABASE_NAME);

  try {
    const vaults = legacyDatabase.objectStoreNames.contains('vaults')
      ? await legacyDatabase.getAll('vaults')
      : [];
    const noteContents = legacyDatabase.objectStoreNames.contains('noteContents')
      ? await legacyDatabase.getAll('noteContents')
      : [];
    const noteIcons = legacyDatabase.objectStoreNames.contains('noteIcons')
      ? await legacyDatabase.getAll('noteIcons')
      : [];
    const transaction = database.transaction(['vaults', 'noteContents', 'noteIcons'], 'readwrite');

    for (const record of vaults) {
      const key: [string, string] = [record.accountId, record.vaultId];
      if (!(await transaction.objectStore('vaults').get(key))) {
        await transaction.objectStore('vaults').put(record);
      }
    }

    for (const record of noteContents) {
      const key: [string, string, string] = [record.accountId, record.vaultId, record.fileId];
      if (!(await transaction.objectStore('noteContents').get(key))) {
        await transaction.objectStore('noteContents').put(record);
      }
    }

    for (const record of noteIcons) {
      const key: [string, string, string] = [record.accountId, record.vaultId, record.fileId];
      if (!(await transaction.objectStore('noteIcons').get(key))) {
        await transaction.objectStore('noteIcons').put(record);
      }
    }

    await transaction.done;
  } finally {
    legacyDatabase.close();
  }

  void deleteDB(LEGACY_VAULT_CACHE_DATABASE_NAME).catch((error) => {
    console.warn('[vault cache] Failed to remove the migrated legacy cache.', error);
  });
}

export async function closeVaultCacheDatabase() {
  if (!databasePromise) return;

  const openDatabase = databasePromise;
  databasePromise = null;

  try {
    const database = await openDatabase;
    database.close();
  } catch {
    // A failed open has no connection to close.
  }
}
