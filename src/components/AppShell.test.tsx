import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearVault: vi.fn(),
  createNote: vi.fn(() => Promise.resolve()),
  disconnect: vi.fn(),
  signOut: vi.fn(),
  toggleTheme: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    disconnect: mocks.disconnect,
    error: null,
    isAuthenticated: true,
    signIn: vi.fn(),
    signOut: mocks.signOut,
    status: 'authenticated',
  }),
}));
vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: mocks.toggleTheme }),
}));
vi.mock('../contexts/VaultContext', () => ({
  useVault: () => ({
    clearVault: mocks.clearVault,
    createNote: mocks.createNote,
    isOnline: true,
    selectedVault: { id: 'vault', name: 'My Vault' },
  }),
}));
vi.mock('./MarkdownViewer', () => ({ MarkdownViewer: () => <div>Viewer</div> }));
vi.mock('./NoteSearch', () => ({ NoteSearch: () => <input id="note-search-input" aria-label="Search notes" /> }));
vi.mock('./Sidebar/Sidebar', () => ({ Sidebar: () => <aside id="vault-sidebar">Sidebar</aside> }));

import { AppShell } from './AppShell';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('AppShell header options', () => {
  it('places all right-side actions in one menu', () => {
    render(<AppShell />);

    expect(screen.queryByRole('menuitem')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open options menu' }));
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.map((item) => item.textContent)).toEqual([
      'Light mode',
      'Change vault',
      'Sign out',
      'Disconnect Google Drive',
    ]);
    expect(document.activeElement).toBe(menuItems[0]);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Change vault' }));
    expect(mocks.clearVault).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('closes on Escape and restores focus to the menu button', () => {
    render(<AppShell />);
    const trigger = screen.getByRole('button', { name: 'Open options menu' });

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('supports conflict-resistant search and new-note shortcuts', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Shortcut note');
    render(<AppShell />);

    fireEvent.keyDown(document, { code: 'KeyK', ctrlKey: true, key: 'k' });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search notes' }));

    fireEvent.keyDown(document, { altKey: true, code: 'KeyN', ctrlKey: true, key: 'n' });
    expect(mocks.createNote).toHaveBeenCalledWith(null, 'Shortcut note');
  });

  it('does not create a note while typing in an editable field', () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Shortcut note');
    render(<AppShell />);
    const input = screen.getByRole('textbox', { name: 'Search notes' });

    fireEvent.keyDown(input, { altKey: true, code: 'KeyN', ctrlKey: true, key: 'n' });

    expect(prompt).not.toHaveBeenCalled();
    expect(mocks.createNote).not.toHaveBeenCalled();
  });
});
