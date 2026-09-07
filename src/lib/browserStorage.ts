export function readMigratedStorage(
  storage: Storage,
  key: string,
  legacyKey: string,
): string | null {
  const currentValue = storage.getItem(key);
  if (currentValue !== null) return currentValue;

  const legacyValue = storage.getItem(legacyKey);
  if (legacyValue === null) return null;

  storage.setItem(key, legacyValue);
  storage.removeItem(legacyKey);
  return legacyValue;
}

export function removeMigratedStorage(storage: Storage, key: string, legacyKey: string) {
  storage.removeItem(key);
  storage.removeItem(legacyKey);
}
