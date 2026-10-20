import { describe, expect, it, vi } from 'vitest';
import { noteIconFromMarkdown, parseNoteIconCache, resolveFavouriteNotes } from '../vaultFeatures';
import type { LocalVaultItem } from '../localVaultCore';
import { getTwemojiUrl } from '../../web/src/lib/twemoji';

describe('Android vault favourites', () => {
  const items: LocalVaultItem[] = [
    { kind: 'note', uri: 'drive:account:vault:week-id', path: 'Media/2025/Week 1.md', parentPath: 'Media/2025', name: 'Week 1.md', size: 0 },
    { kind: 'note', uri: 'drive:account:vault:today-id', path: 'Today.md', parentPath: '', name: 'Today.md', size: 0 },
  ];

  it('resolves web favourites in stored ID order and omits missing files', () => {
    expect(resolveFavouriteNotes(items, ['week-id', 'today-id', 'missing-id']).map((note) => note.uri)).toEqual(items.map((note) => note.uri));
  });

  it('keeps favourites after renaming or moving and distinguishes identical paths', () => {
    const changed: LocalVaultItem[] = [
      { ...items[0], path: 'Moved/Renamed.md', name: 'Renamed.md', parentPath: 'Moved' },
      { ...items[1], path: 'Moved/Renamed.md' },
    ];
    expect(resolveFavouriteNotes(changed, ['week-id'])).toEqual([changed[0]]);
  });
});

describe('Android note icons', () => {
  it('resolves cached note emoji to the same pinned SVG set as the web app', () => {
    expect(getTwemojiUrl('📝')).toBe('https://cdn.jsdelivr.net/gh/jdecked/twemoji@v17.0.2/assets/svg/1f4dd.svg');
  });

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
