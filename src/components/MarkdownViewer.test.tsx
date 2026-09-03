import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../types/vault';

const mocks = vi.hoisted(() => ({
  cacheContent: vi.fn(),
  cacheNoteIcon: vi.fn(),
  content: 'original body',
  deleteNote: vi.fn(),
  ensureAccessToken: vi.fn(() => Promise.resolve('valid-token')),
  renameNote: vi.fn(),
  setContent: vi.fn(),
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
    invalidateAccessToken: vi.fn(),
  }),
}));
vi.mock('../contexts/VaultContext', () => ({
  useVault: () => ({
    cacheNoteIcon: mocks.cacheNoteIcon,
    deleteNote: mocks.deleteNote,
    favoriteNoteIds: [],
    isOnline: true,
    renameNote: mocks.renameNote,
    resolveWikilink: () => null,
    selectFile: vi.fn(),
    selectedFile,
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
    setContent: mocks.setContent,
  }),
}));
vi.mock('../lib/googleDrive', () => ({
  isGoogleDriveAuthError: () => false,
  updateDriveFileText: mocks.updateDriveFileText,
}));
vi.mock('./MarkdownEditor', () => ({
  MarkdownEditor: ({ value, onChange, onSave }: { value: string; onChange: (value: string) => void; onSave: () => void }) => (
    <textarea
      aria-label="Markdown draft"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          onSave();
        }
      }}
    />
  ),
}));

import { MarkdownViewer } from './MarkdownViewer';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.content = 'original body';
  mocks.updateDriveFileText.mockResolvedValue({
    ...selectedFile.source,
    modifiedTime: 'saved',
  });
});

afterEach(cleanup);

describe('MarkdownViewer cache conflicts', () => {
  it('combines optional frontmatter properties and note controls above the note', () => {
    mocks.content = '---\ntitle: Test note\n---\nBody';
    const { container } = render(<MarkdownViewer />);

    const noteView = container.querySelector('.note-view');
    const properties = container.querySelector('.frontmatter-panel');
    const article = container.querySelector('.markdown-body');
    expect(properties?.parentElement).toBe(container.querySelector('.viewer'));
    expect(article?.parentElement).toBe(noteView);
    expect(article?.contains(properties)).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Note' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '1 property' })).not.toBeNull();
  });

  it('keeps note controls visible without rendering a properties disclosure when none exist', () => {
    render(<MarkdownViewer />);

    expect(screen.getByRole('region', { name: 'Note controls' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /propert/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeNull();
  });

  it('offers favourite, rename, and delete actions in the note menu', () => {
    render(<MarkdownViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Note actions' }));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Add favourite' }));
    expect(mocks.toggleFavorite).toHaveBeenCalledWith('note');

    fireEvent.click(screen.getByRole('button', { name: 'Note actions' }));
    expect(screen.getByRole('menuitem', { name: 'Rename note' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Delete note' })).not.toBeNull();
  });

  it('preserves an unsaved draft when fresher Drive content arrives and caches the later local save', async () => {
    const { rerender } = render(<MarkdownViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown draft' }), {
      target: { value: 'my local draft' },
    });

    mocks.content = 'new body from Drive';
    rerender(<MarkdownViewer />);

    expect((screen.getByRole('textbox', { name: 'Markdown draft' }) as HTMLTextAreaElement).value).toBe(
      'my local draft',
    );
    expect(screen.getByText(/changed in Google Drive while you were editing/i)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.updateDriveFileText).toHaveBeenCalledWith('valid-token', 'note', 'my local draft'),
    );
    expect(mocks.cacheContent).toHaveBeenCalledWith('my local draft', 'saved');
    expect(mocks.storeSavedNote).toHaveBeenCalledWith(
      selectedFile,
      expect.objectContaining({ modifiedTime: 'saved' }),
      'my local draft',
    );
  });

  it('saves with Ctrl+S and returns to view mode', async () => {
    render(<MarkdownViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole('textbox', { name: 'Markdown draft' });
    fireEvent.change(editor, { target: { value: 'saved by shortcut' } });

    fireEvent.keyDown(editor, { ctrlKey: true, key: 's' });

    await waitFor(() => expect(mocks.updateDriveFileText).toHaveBeenCalledWith(
      'valid-token',
      'note',
      'saved by shortcut',
    ));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Markdown draft' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeNull();
  });

  it('caches the edited content and shows a header spinner while Drive saves', async () => {
    let resolveSave: ((value: typeof selectedFile.source) => void) | undefined;
    mocks.updateDriveFileText.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(<MarkdownViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown draft' }), {
      target: { value: 'optimistic body' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('textbox', { name: 'Markdown draft' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Saving...');
    expect(mocks.cacheContent).toHaveBeenCalledWith('optimistic body');

    resolveSave?.({ ...selectedFile.source, modifiedTime: 'saved' });

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(mocks.cacheContent).toHaveBeenLastCalledWith('optimistic body', 'saved');
  });

  it('reopens the editor with the optimistic draft when saving fails', async () => {
    mocks.updateDriveFileText.mockRejectedValueOnce(new Error('Drive write failed'));
    render(<MarkdownViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown draft' }), {
      target: { value: 'preserved draft' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: 'Markdown draft' }) as HTMLTextAreaElement).value).toBe(
        'preserved draft',
      ),
    );
    expect(screen.getByText('Drive write failed')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
