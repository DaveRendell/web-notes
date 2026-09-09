import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../types/vault';

const mocks = vi.hoisted(() => ({
  cacheContent: vi.fn(),
  cacheNoteIcon: vi.fn(),
  content: 'original body',
  deleteNote: vi.fn(),
  ensureAccessToken: vi.fn(() => Promise.resolve('valid-token')),
  invalidateAccessToken: vi.fn(),
  isOnline: true,
  notes: [] as VaultNode[],
  renameNote: vi.fn(),
  selectedFile: null as VaultNode | null,
  selectFile: vi.fn(),
  storeSavedNote: vi.fn(),
  toggleFavorite: vi.fn(),
  updateDriveFileText: vi.fn(),
}));

const selectedFile: VaultNode = {
  id: 'note',
  mimeType: 'text/markdown',
  name: 'Note.md',
  path: 'Note.md',
  source: { id: 'note', mimeType: 'text/markdown', modifiedTime: 'old', name: 'Note.md' },
  type: 'markdown',
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    accessToken: 'token',
    accountId: 'account',
    ensureAccessToken: mocks.ensureAccessToken,
    invalidateAccessToken: mocks.invalidateAccessToken,
  }),
}));

vi.mock('../contexts/VaultContext', () => ({
  useVault: () => ({
    cacheNoteIcon: mocks.cacheNoteIcon,
    deleteNote: mocks.deleteNote,
    favoriteNoteIds: [],
    isOnline: mocks.isOnline,
    notes: mocks.notes,
    recentNotes: [],
    renameNote: mocks.renameNote,
    selectFile: mocks.selectFile,
    selectedFile: mocks.selectedFile ?? selectedFile,
    selectedVault: { id: 'vault', name: 'My vault' },
    storeSavedNote: mocks.storeSavedNote,
    toggleFavorite: mocks.toggleFavorite,
  }),
}));

vi.mock('../hooks/useMarkdownFile', () => ({
  useMarkdownFile: () => ({
    cacheContent: mocks.cacheContent,
    content: mocks.content,
    error: null,
    isLoading: false,
    isRefreshing: false,
    refreshError: null,
  }),
}));

vi.mock('../lib/googleDrive', () => ({
  isGoogleDriveAuthError: () => false,
  updateDriveFileText: mocks.updateDriveFileText,
}));

vi.mock('./NoteEditorShell', () => ({
  NoteEditorShell: ({ mode, onBlur, onChange, onSave, readOnly, value }: {
    mode: 'rich' | 'source';
    onBlur: () => void;
    onChange: (value: string) => void;
    onSave: () => void;
    readOnly: boolean;
    value: string;
  }) => (
    <textarea
      aria-label={mode === 'rich' ? 'Rich note' : 'Markdown draft'}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') onSave();
      }}
      readOnly={readOnly}
      value={value}
    />
  ),
}));

import { MarkdownViewer } from './MarkdownViewer';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mocks.content = 'original body';
  selectedFile.name = 'Note.md';
  selectedFile.path = 'Note.md';
  mocks.isOnline = true;
  mocks.notes = [selectedFile];
  mocks.selectedFile = null;
  mocks.updateDriveFileText.mockResolvedValue({ ...selectedFile.source, modifiedTime: 'saved' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MarkdownViewer rich editing', () => {
  it('opens notes in the rich editor by default', () => {
    render(<MarkdownViewer />);
    expect((screen.getByRole('textbox', { name: 'Rich note' }) as HTMLTextAreaElement).value).toBe('original body');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('autosaves rich-text changes after one second of inactivity', async () => {
    vi.useFakeTimers();
    render(<MarkdownViewer />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Rich note' }), { target: { value: 'changed body' } });

    await vi.advanceTimersByTimeAsync(999);
    expect(mocks.updateDriveFileText).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(mocks.updateDriveFileText).toHaveBeenCalledWith('valid-token', 'note', 'changed body');
    expect(mocks.cacheContent).toHaveBeenCalledWith('changed body');
  });

  it('saves immediately when focus leaves the rich note', async () => {
    render(<MarkdownViewer />);
    const editor = screen.getByRole('textbox', { name: 'Rich note' });
    fireEvent.change(editor, { target: { value: 'save on blur' } });
    fireEvent.blur(editor);

    await waitFor(() => expect(mocks.updateDriveFileText).toHaveBeenCalledWith('valid-token', 'note', 'save on blur'));
  });

  it('places saving status before sequential navigation and the fixed mode switch', async () => {
    const previous = { ...selectedFile, id: 'previous', name: 'Note 1.md', path: 'Note 1.md' };
    selectedFile.name = 'Note 2.md';
    selectedFile.path = 'Note 2.md';
    mocks.notes = [previous, selectedFile];
    mocks.updateDriveFileText.mockReturnValueOnce(new Promise(() => undefined));
    render(<MarkdownViewer />);
    const editor = screen.getByRole('textbox', { name: 'Rich note' });
    fireEvent.change(editor, { target: { value: 'saving draft' } });
    fireEvent.blur(editor);

    const status = await screen.findByRole('status');
    const navigation = screen.getByRole('navigation', { name: 'Sequential notes' });
    const switcher = screen.getByRole('group', { name: 'Editor mode' });
    expect(status.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(status.compareDocumentPosition(switcher) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('preserves and saves a draft when browser navigation changes the selected note without a blur', async () => {
    const { rerender } = render(<MarkdownViewer />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Rich note' }), { target: { value: 'departing draft' } });

    mocks.selectedFile = {
      ...selectedFile,
      id: 'next-note',
      name: 'Next.md',
      path: 'Next.md',
      source: { ...selectedFile.source, id: 'next-note', name: 'Next.md' },
    };
    mocks.content = 'next body';
    rerender(<MarkdownViewer />);

    await waitFor(() => expect(mocks.updateDriveFileText).toHaveBeenCalledWith('valid-token', 'note', 'departing draft'));
  });

  it('switches to Markdown from the note header with explicit Save and Cancel', async () => {
    render(<MarkdownViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));

    const source = screen.getByRole('textbox', { name: 'Markdown draft' });
    fireEvent.change(source, { target: { value: '# Raw source' } });
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeNull();
    fireEvent.keyDown(source, { ctrlKey: true, key: 's' });

    await waitFor(() => expect(mocks.updateDriveFileText).toHaveBeenCalledWith('valid-token', 'note', '# Raw source'));
    expect(screen.getByRole('textbox', { name: 'Rich note' })).not.toBeNull();
  });

  it('preserves a failed rich draft and offers a retry', async () => {
    mocks.updateDriveFileText.mockRejectedValueOnce(new Error('Drive write failed'));
    render(<MarkdownViewer />);
    const editor = screen.getByRole('textbox', { name: 'Rich note' });
    fireEvent.change(editor, { target: { value: 'preserved draft' } });
    fireEvent.blur(editor);

    expect(await screen.findByText('Drive write failed')).not.toBeNull();
    expect((screen.getByRole('textbox', { name: 'Rich note' }) as HTMLTextAreaElement).value).toBe('preserved draft');
    expect(screen.getByRole('button', { name: 'Retry save' })).not.toBeNull();
  });

  it('keeps sequential navigation in the fixed note header', () => {
    const previous = { ...selectedFile, id: 'previous', name: 'Note 1.md', path: 'Note 1.md' };
    selectedFile.name = 'Note 2.md';
    selectedFile.path = 'Note 2.md';
    mocks.notes = [previous, selectedFile];
    render(<MarkdownViewer />);

    expect(document.querySelector('.note-sequence-current')?.textContent).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Previous note: 1' }));
    expect(mocks.selectFile).toHaveBeenCalledWith(previous);
  });
});
