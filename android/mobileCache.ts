import * as FileSystem from 'expo-file-system/legacy';

export interface CacheStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove?(key: string): Promise<void>;
}

/** Versioned, promise-based native cache. No tokens are persisted here. */
export class MobileCache {
  constructor(private storage: CacheStorage) {}
  async get<T>(key: string, validate: (value: unknown) => value is T): Promise<T | null> {
    try {
      return await this.getRequired(key, validate);
    } catch (cause) { console.warn('Could not read mobile cache:', cause); return null; }
  }
  async getRequired<T>(key: string, validate: (value: unknown) => value is T): Promise<T | null> {
    const raw = await this.storage.read(key);
    if (raw === null) return null;
    const record = JSON.parse(raw);
    if (record?.version !== 1 || !validate(record.value)) throw new Error('Invalid local data; preserved for recovery.');
    return record.value;
  }
  async put<T>(key: string, value: T): Promise<void> {
    try { await this.putRequired(key, value); }
    catch (cause) { console.warn('Could not write mobile cache:', cause); }
  }
  // Offline drafts are user data, not disposable cache: propagate quota/I/O errors.
  async putRequired<T>(key: string, value: T): Promise<void> {
    await this.storage.write(key, JSON.stringify({ version: 1, value }));
  }
  async delete(key: string): Promise<void> {
    try { await this.storage.remove?.(key); }
    catch (cause) { console.warn('Could not delete mobile cache:', cause); }
  }
}

const directory = `${FileSystem.documentDirectory}drive-cache/`;
const pending = new Map<string, Promise<void>>();
export const mobileCache = new MobileCache({
  async read(key) {
    const uri = `${directory}${encodeURIComponent(key)}.json`;
    if (!(await FileSystem.getInfoAsync(uri)).exists) return null;
    return FileSystem.readAsStringAsync(uri);
  },
  async remove(key) {
    await pending.get(key)?.catch(() => {});
    await FileSystem.deleteAsync(`${directory}${encodeURIComponent(key)}.json`, { idempotent: true });
  },
  async write(key, value) {
    const previous = pending.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const uri = `${directory}${encodeURIComponent(key)}.json`;
      const temporary = `${uri}.pending`;
      await FileSystem.writeAsStringAsync(temporary, value);
      await FileSystem.moveAsync({ from: temporary, to: uri });
    });
    pending.set(key, next);
    try { await next; } finally { if (pending.get(key) === next) pending.delete(key); }
  },
});
