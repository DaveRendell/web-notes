import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { VaultNode } from '../types/vault';

export const VAULT_CACHE_DATABASE_NAME = 'vault-web-viewer';
export const VAULT_CACHE_DATABASE_VERSION = 2;

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

interface VaultCacheSchema extends DBSchema {
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
}

let databasePromise: Promise<IDBPDatabase<VaultCacheSchema>> | null = null;

export function getVaultCacheDatabase() {
  if (!databasePromise) {
    databasePromise = openDB<VaultCacheSchema>(VAULT_CACHE_DATABASE_NAME, VAULT_CACHE_DATABASE_VERSION, {
      upgrade(database) {
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
      },
    });

    const openingDatabase = databasePromise;
    void openingDatabase.catch(() => {
      if (databasePromise === openingDatabase) databasePromise = null;
    });
  }

  return databasePromise;
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
