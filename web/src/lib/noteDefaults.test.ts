import { describe, expect, it } from 'vitest';
import { getNewNoteContent } from './noteDefaults';

describe('new note content', () => {
  it('starts with a heading using the extension-free title', () => {
    expect(getNewNoteContent('New note.md')).toBe('# New note\n');
    expect(getNewNoteContent('🎮 Games.MD')).toBe('# 🎮 Games\n');
  });
  it('escapes formatting characters in file names', () => {
    expect(getNewNoteContent('[Draft] *important*')).toBe('# \\[Draft\\] \\*important\\*\n');
  });
});
