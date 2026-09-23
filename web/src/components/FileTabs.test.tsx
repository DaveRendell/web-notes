import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../types/vault';

const files = vi.hoisted(() => [note('one', 'One.md'), note('two', 'Two.md')]);
const mocks = vi.hoisted(() => ({ activateFileTab: vi.fn(), closeFileTab: vi.fn() }));

vi.mock('../contexts/VaultContext', () => ({
  useVault: () => ({
    activateFileTab: mocks.activateFileTab,
    closeFileTab: mocks.closeFileTab,
    noteIcons: { one: '📝' },
    openFiles: files,
    selectedFile: files[0],
  }),
}));

import { FileTabs } from './FileTabs';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FileTabs', () => {
  it('shows only when multiple files are open and supports activation and closing', () => {
    render(<FileTabs />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector<HTMLImageElement>('.note-emoji .twemoji')?.src).toMatch(/\/1f4dd\.svg$/);

    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(mocks.activateFileTab).toHaveBeenCalledWith('two');
    fireEvent.click(screen.getByRole('button', { name: 'Close One' }));
    expect(mocks.closeFileTab).toHaveBeenCalledWith('one');
  });

  it('closes a tab with the middle mouse button', () => {
    render(<FileTabs />);
    fireEvent(screen.getByRole('tab', { name: 'Two' }), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(mocks.closeFileTab).toHaveBeenCalledWith('two');
    expect(mocks.activateFileTab).not.toHaveBeenCalled();
  });
});

function note(id: string, name: string): VaultNode {
  return {
    id,
    mimeType: 'text/markdown',
    name,
    path: name,
    source: { id, mimeType: 'text/markdown', name },
    type: 'markdown',
  };
}
