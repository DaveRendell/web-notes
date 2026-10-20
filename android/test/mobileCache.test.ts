import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///test/' }));
import { MobileCache } from '../mobileCache';
const isString = (value: unknown): value is string => typeof value === 'string';

describe('native versioned cache', () => {
  it('round trips values and separates compound keys', async () => {
    const records = new Map<string, string>();
    const cache = new MobileCache({ read: async (key) => records.get(key) ?? null, write: async (key, value) => { records.set(key, value); } });
    await cache.put('account1:vault:file', 'text');
    expect(await cache.get('account1:vault:file', isString)).toBe('text');
    expect(await cache.get('account2:vault:file', isString)).toBeNull();
  });
  it.each(['broken', '{"version":2,"value":"old"}', '{"version":1,"value":10}'])('treats malformed or obsolete data as a miss: %s', async (raw) => {
    const cache = new MobileCache({ read: async () => raw, write: async () => {} });
    expect(await cache.get('key', isString)).toBeNull();
    await expect(cache.getRequired('key', isString)).rejects.toThrow();
  });
  it('makes cache errors nonfatal but propagates durable draft failures', async () => {
    const cache = new MobileCache({ read: async () => { throw new Error('I/O'); }, write: async () => { throw new Error('Quota'); } });
    expect(await cache.get('key', isString)).toBeNull();
    await expect(cache.put('key', 'text')).resolves.toBeUndefined();
    await expect(cache.putRequired('key', 'draft')).rejects.toThrow('Quota');
  });
});
