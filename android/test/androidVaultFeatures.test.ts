import { describe, expect, it, vi } from 'vitest';
import { noteIconFromMarkdown, parseFavouritePaths, parseNoteIconCache, resolveFavouriteNotes } from '../vaultFeatures';
import type { LocalVaultItem } from '../localVaultCore';

describe('Android vault favourites', () => {
  const items: LocalVaultItem[] = [
    { kind: 'note', uri: 'uri-b', path: 'Media/2025/Week 1.md', parentPath: 'Media/2025', name: 'Week 1.md', size: 0 },
    { kind: 'note', uri: 'uri-a', path: 'Today.md', parentPath: '', name: 'Today.md', size: 0 },
  ];

  it('resolves web favourites in their stored order via vault-relative paths', () => {
    const paths = parseFavouritePaths(JSON.stringify({
      version: 1,
      favourites: ['week-id', 'today-id', 'week-id', 'missing-id'],
      favouritePaths: { 'week-id': 'Media/2025/Week 1.md', 'today-id': 'Today.md', 'missing-id': 'Deleted.md' },
    }));
    expect(paths).toEqual(['Media/2025/Week 1.md', 'Today.md', 'Deleted.md']);
    expect(resolveFavouriteNotes(items, paths).map((note) => note.uri)).toEqual(['uri-b', 'uri-a']);
  });

  it('handles legacy ID-only settings and rejects unsafe paths', () => {
    expect(parseFavouritePaths('{"version":1,"favourites":["drive-id"]}')).toEqual([]);
    expect(parseFavouritePaths('{"version":1,"favourites":["one","two"],"favouritePaths":{"one":"../secret.md","two":"/root.md"}}')).toEqual([]);
    expect(() => parseFavouritePaths('{}')).toThrow();
  });
});

describe('Android note icons', () => {
  it('uses the first visible emoji, ignoring frontmatter and heading syntax', () => {
    expect(noteIconFromMarkdown('---\nicon: ❌\n---\n# **🎮 Games**')).toBe('🎮');
    expect(noteIconFromMarkdown('# Plain text 🎮')).toBeNull();
  });

  it('recognizes emoji when Intl.Segmenter is unavailable on Android', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    try {
      expect(noteIconFromMarkdown('# 🎮 Games')).toBe('🎮');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts only an icon cache for the selected vault', () => {
    const cache = { version: 1, rootUri: 'one', icons: { 'Today.md': '🎮', 'Plain.md': null } };
    expect(parseNoteIconCache(cache, 'one')).toEqual(cache.icons);
    expect(parseNoteIconCache(cache, 'two')).toBeNull();
    expect(parseNoteIconCache({ ...cache, icons: { 'Today.md': 42 } }, 'one')).toBeNull();
  });
});
