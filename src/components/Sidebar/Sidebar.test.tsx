import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFolder: vi.fn(),
  createNote: vi.fn(),
  isRefreshing: false,
}));

vi.mock('../../contexts/VaultContext', () => ({
  useVault: () => ({
    createFolder: mocks.createFolder,
    createNote: mocks.createNote,
    error: null,
    isLoading: false,
    isOnline: true,
    isRefreshing: mocks.isRefreshing,
    refreshError: null,
    selectedVault: { id: 'vault', name: 'Vault' },
    tree: [{ id: 'note' }],
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
