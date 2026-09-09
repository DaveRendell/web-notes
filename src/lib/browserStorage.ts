type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Resolve storage lazily: even accessing window.localStorage can throw when
// browser privacy settings disallow persistence. Never log stored values.
export function createSafeStorage(resolve: () => KeyValueStorage): KeyValueStorage {
  let warned = false;
  function attempt<T>(operation: (storage: KeyValueStorage) => T, fallback: T): T {
    try {
      return operation(resolve());
    } catch {
      if (!warned) {
        console.warn('[storage] Browser storage is unavailable; changes may not survive a reload.');
        warned = true;
      }
      return fallback;
    }
  }
  return {
    getItem: (key) => attempt((storage) => storage.getItem(key), null),
    setItem: (key, value) => attempt((storage) => storage.setItem(key, value), undefined),
    removeItem: (key) => attempt((storage) => storage.removeItem(key), undefined),
  };
}

export const safeLocalStorage = createSafeStorage(() => window.localStorage);
export const safeSessionStorage = createSafeStorage(() => window.sessionStorage);

export function readMigratedStorage(
  storage: KeyValueStorage,
  key: string,
  legacyKey: string,
): string | null {
  const currentValue = storage.getItem(key);
  if (currentValue !== null) return currentValue;

  const legacyValue = storage.getItem(legacyKey);
  if (legacyValue === null) return null;

  storage.setItem(key, legacyValue);
  // A quota failure must not delete the only persisted copy.
  if (storage.getItem(key) === legacyValue) storage.removeItem(legacyKey);
  return legacyValue;
}

export function removeMigratedStorage(storage: KeyValueStorage, key: string, legacyKey: string) {
  storage.removeItem(key);
  storage.removeItem(legacyKey);
}
