import { findLeadingEmoji } from '../web/src/lib/markdown';
import type { LocalNote, LocalVaultItem } from './localVaultCore';
import { parseDriveUri } from './driveVaultCore';

export function resolveFavouriteNotes(items: LocalVaultItem[], ids: string[]): LocalNote[] {
  const notes = new Map(items.filter((item): item is LocalNote => item.kind === 'note').map((note) => [parseDriveUri(note.uri).fileId, note]));
  return ids.flatMap((id) => {
    const note = notes.get(id);
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
