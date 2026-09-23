import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFolder: vi.fn(),
  createNote: vi.fn(),
  isRefreshing: false,
  openWeeklyNote: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../contexts/VaultContext', () => ({
  useVault: () => ({
    createFolder: mocks.createFolder,
    createNote: mocks.createNote,
    error: null,
    isLoading: false,
    isOnline: true,
    isRefreshing: mocks.isRefreshing,
    noteIcons: { template: '📅' },
    openWeeklyNote: mocks.openWeeklyNote,
    refreshError: null,
    selectedFile: null,
    selectedVault: { id: 'vault', name: 'Vault' },
    tree: [{
      id: 'templates', name: 'Templates', path: 'Templates', type: 'folder', source: {}, children: [
        { id: 'template', name: 'Week.md', path: 'Templates/Week.md', type: 'markdown', source: {} },
      ],
    }],
  }),
}));
vi.mock('./FavoriteNotes', () => ({ FavoriteNotes: () => <section>Favourites section</section> }));
vi.mock('./FileTree', () => ({ FileTree: () => <div>File tree</div> }));

import { Sidebar } from './Sidebar';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.isRefreshing = false;
});

describe('Sidebar files section', () => {
  it("shows this week's prospective note as a note row above favourites", () => {
    render(<Sidebar />);

    const weeklyNote = screen.getByRole('button', { name: /Open this week's note: Week \d+ \d{4}/ });
    expect(weeklyNote.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(weeklyNote.compareDocumentPosition(screen.getByText('Favourites section')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(weeklyNote);
    expect(mocks.openWeeklyNote).toHaveBeenCalledOnce();
  });

  it('puts root creation actions beside a collapsible Files heading', () => {
    render(<Sidebar />);

    const filesToggle = screen.getByRole('button', { name: 'Files' });
    const sectionHeader = filesToggle.closest('.sidebar-section-header');
    expect(sectionHeader?.contains(screen.getByRole('button', { name: 'Add note' }))).toBe(true);
    expect(sectionHeader?.contains(screen.getByRole('button', { name: 'Add folder' }))).toBe(true);
    const sectionContent = screen.getByText('File tree').closest('.sidebar-section-content');
    const filesSection = filesToggle.closest('.files-section');
    expect(sectionContent?.getAttribute('aria-hidden')).toBe('false');
    expect(filesSection?.classList.contains('is-open')).toBe(true);

    fireEvent.click(filesToggle);

    expect(sectionContent?.getAttribute('aria-hidden')).toBe('true');
    expect(filesSection?.classList.contains('is-open')).toBe(false);
    expect(screen.getByRole('button', { name: 'Add note' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add folder' })).toBeTruthy();
  });

  it('shows refresh activity beside Files instead of inside the scrolling content', () => {
    mocks.isRefreshing = true;
    render(<Sidebar />);

    const refreshStatus = screen.getByRole('status', { name: 'Refreshing from Google Drive' });
    const filesHeader = screen.getByRole('button', { name: /Files/ }).closest('.sidebar-section-header');
    const sectionContent = screen.getByText('File tree').closest('.sidebar-section-content');

    expect(filesHeader?.contains(refreshStatus)).toBe(true);
    expect(sectionContent?.contains(refreshStatus)).toBe(false);
  });
});
