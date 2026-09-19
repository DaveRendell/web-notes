import { findLeadingEmoji } from '../web/src/lib/markdown';
import type { LocalNote, LocalVaultItem } from './localVaultCore';

export function parseFavouritePaths(content: string): string[] {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid .web-notes.json settings.');
  const settings = value as Record<string, unknown>;
  if (settings.version !== 1 || !Array.isArray(settings.favourites)) throw new Error('Unsupported .web-notes.json settings.');
  const paths = settings.favouritePaths;
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) return [];
  const byId = paths as Record<string, unknown>;
  return [...new Set(settings.favourites.flatMap((id) => {
    const path = typeof id === 'string' ? byId[id] : undefined;
    return typeof path === 'string' && path.endsWith('.md') && !path.startsWith('/') && !path.split('/').includes('..')
      ? [path] : [];
  }))];
}

export function resolveFavouriteNotes(items: LocalVaultItem[], paths: string[]): LocalNote[] {
  const notes = new Map(items.filter((item): item is LocalNote => item.kind === 'note').map((note) => [note.path, note]));
  return paths.flatMap((path) => {
    const note = notes.get(path);
    return note ? [note] : [];
  });
}

export function noteIconFromMarkdown(markdown: string): string | null {
  try {
    return findLeadingEmoji(markdown);
  } catch (cause) {
    console.warn('Could not derive a note icon:', cause);
    return null;
  }
}

export function parseNoteIconCache(value: unknown, rootUri: string): Record<string, string | null> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const cache = value as Record<string, unknown>;
  if (cache.version !== 1 || cache.rootUri !== rootUri || !cache.icons || typeof cache.icons !== 'object' || Array.isArray(cache.icons)) return null;
  const icons = cache.icons as Record<string, unknown>;
  if (Object.values(icons).some((icon) => icon !== null && typeof icon !== 'string')) return null;
  return icons as Record<string, string | null>;
}
