import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../types/vault';

const mocks = vi.hoisted(() => ({
  cacheContent: vi.fn(),
  cacheNoteIcon: vi.fn(),
  content: 'original body',
  ensureAccessToken: vi.fn(() => Promise.resolve('valid-token')),
  setContent: vi.fn(),
  storeSavedNote: vi.fn(),
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
    isOnline: true,
    resolveWikilink: () => null,
    selectFile: vi.fn(),
    selectedFile,
    selectedVault: { id: 'vault', name: 'My vault' },
    storeSavedNote: mocks.storeSavedNote,
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
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Markdown draft" value={value} onChange={(event) => onChange(event.target.value)} />
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
  it('renders frontmatter properties flush outside the padded markdown article', () => {
    mocks.content = '---\ntitle: Test note\n---\nBody';
    const { container } = render(<MarkdownViewer />);

    const noteView = container.querySelector('.note-view');
    const properties = container.querySelector('.frontmatter-panel');
    const article = container.querySelector('.markdown-body');
    expect(properties?.parentElement).toBe(noteView);
    expect(article?.parentElement).toBe(noteView);
    expect(article?.contains(properties)).toBe(false);
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
});
