import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../types/vault';

const mocks = vi.hoisted(() => ({ selectFile: vi.fn() }));
const notes = [note('alpha', 'Alpha.md', 'Projects/Alpha.md'), note('beta', 'Beta.md', 'Beta.md')];

vi.mock('../contexts/VaultContext', () => ({
  useVault: () => ({
    notes,
    recentNotes: [notes[1], notes[0]],
    selectFile: mocks.selectFile,
  }),
}));

import { NoteSearch } from './NoteSearch';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NoteSearch', () => {
  it('shows recent notes in order when focused with an empty query', () => {
    render(<NoteSearch />);

    fireEvent.focus(screen.getByRole('combobox'));

    expect(screen.getByText('Recent notes')).toBeTruthy();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'BetaBeta.md',
      'AlphaProjects/Alpha.md',
    ]);
  });

  it('switches to matching notes when text is entered', () => {
    render(<NoteSearch />);
    const search = screen.getByRole('combobox');

    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'alp' } });

    expect(screen.queryByText('Recent notes')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option').textContent).toBe('AlphaProjects/Alpha.md');
  });

  it('selects a recent note with the keyboard', () => {
    render(<NoteSearch />);
    const search = screen.getByRole('combobox');

    fireEvent.focus(search);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(mocks.selectFile).toHaveBeenCalledWith(notes[0]);
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
