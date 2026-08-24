import type { VaultNode } from '../types/vault';

export function searchNotes(notes: VaultNode[], query: string, limit = 8) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return notes
    .map((note) => ({
      note,
      score: getSearchScore(note, normalizedQuery),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      a.note.name.localeCompare(b.note.name) ||
      a.note.path.localeCompare(b.note.path),
    )
    .slice(0, limit)
    .map((result) => result.note);
}

export function getNoteTitle(note: VaultNode) {
  return note.name.replace(/\.md$/i, '');
}

function getSearchScore(note: VaultNode, normalizedQuery: string) {
  const title = getNoteTitle(note).toLowerCase();
  const path = note.path.toLowerCase();

  if (title === normalizedQuery) return 100;
  if (title.startsWith(normalizedQuery)) return 80;
  if (title.includes(normalizedQuery)) return 60;
  if (path.includes(normalizedQuery)) return 30;
  return 0;
}
