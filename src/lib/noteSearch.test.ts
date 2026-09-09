import { describe, expect, it } from 'vitest';
import type { VaultNode } from '../types/vault';
import { getNoteSuggestions, getNoteTitle, searchNotes } from './noteSearch';

describe('note search', () => {
  const notes = [
    note('alpha', 'Alpha.md', 'Projects/Alpha.md'),
    note('alphabet', 'Alphabet.md', 'Archive/Alphabet.md'),
    note('plan', 'Plan.md', 'Alpha/Plan.md'),
  ];

  it('ranks title matches ahead of path-only matches and respects the limit', () => {
    expect(searchNotes(notes, 'alpha', 2).map((result) => result.id)).toEqual(['alpha', 'alphabet']);
  });

  it('uses recent notes for an empty completion query', () => {
    expect(getNoteSuggestions(notes, [notes[1], notes[0]], '', 1)).toEqual([notes[1]]);
  });

  it('strips the Markdown extension from display titles', () => {
    expect(getNoteTitle(notes[0])).toBe('Alpha');
    expect(getNoteTitle(note('plain', 'Plain', 'Plain'))).toBe('Plain');
  });
});

function note(id: string, name: string, path: string): VaultNode {
  return {
    id,
    mimeType: 'text/markdown',
    name,
    path,
    source: { id, mimeType: 'text/markdown', name },
    type: 'markdown',
  };
}
