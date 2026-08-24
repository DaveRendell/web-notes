import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFolder: vi.fn(),
  createNote: vi.fn(),
}));

vi.mock('../../contexts/VaultContext', () => ({
  useVault: () => ({
    createFolder: mocks.createFolder,
    createNote: mocks.createNote,
    error: null,
    isLoading: false,
    isOnline: true,
    isRefreshing: false,
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
});

describe('Sidebar files section', () => {
  it('puts root creation actions beside a collapsible Files heading', () => {
    render(<Sidebar />);

    const filesToggle = screen.getByRole('button', { name: 'Files' });
    const sectionHeader = filesToggle.closest('.sidebar-section-header');
    expect(sectionHeader?.contains(screen.getByRole('button', { name: 'Add note' }))).toBe(true);
    expect(sectionHeader?.contains(screen.getByRole('button', { name: 'Add folder' }))).toBe(true);
    const sectionContent = screen.getByText('File tree').closest('.sidebar-section-content');
    expect(sectionContent?.getAttribute('aria-hidden')).toBe('false');

    fireEvent.click(filesToggle);

    expect(sectionContent?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'Add note' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add folder' })).toBeTruthy();
  });
});
