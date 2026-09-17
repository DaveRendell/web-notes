import { describe, expect, it, vi } from 'vitest';
import { createSafeStorage, readMigratedStorage, removeMigratedStorage } from './browserStorage';

describe('safe browser persistence', () => {
  it('handles blocked storage access and warns once without exposing data', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createSafeStorage(() => { throw new DOMException('secret', 'SecurityError'); });
    expect(storage.getItem('token')).toBeNull();
    expect(() => storage.setItem('token', 'secret')).not.toThrow();
    expect(() => storage.removeItem('token')).not.toThrow();
    expect(warning).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret');
  });
  it('retains legacy data if migration cannot persist it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const original = {
      getItem: vi.fn((key: string) => key === 'old' ? 'value' : null),
      setItem: vi.fn(() => { throw new DOMException('full', 'QuotaExceededError'); }),
      removeItem: vi.fn(),
    };
    expect(readMigratedStorage(createSafeStorage(() => original), 'new', 'old')).toBe('value');
    expect(original.removeItem).not.toHaveBeenCalled();
  });
  it('migrates and removes values normally when storage is available', () => {
    const values = new Map([['old', 'value']]);
    const storage = createSafeStorage(() => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    }));
    expect(readMigratedStorage(storage, 'new', 'old')).toBe('value');
    expect(values.has('old')).toBe(false);
    removeMigratedStorage(storage, 'new', 'old');
    expect(values.size).toBe(0);
  });
});
