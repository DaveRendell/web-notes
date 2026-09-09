import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../../types/vault';

const mocks = vi.hoisted(() => ({
  draggable: vi.fn(() => () => undefined),
  dropTargetForElements: vi.fn(() => () => undefined),
  monitorForElements: vi.fn(() => () => undefined),
  reorderFavorite: vi.fn(),
  selectFile: vi.fn(),
  toggleFavorite: vi.fn(),
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: mocks.draggable,
  dropTargetForElements: mocks.dropTargetForElements,
  monitorForElements: mocks.monitorForElements,
}));

const favorites = [note('one', 'One.md'), note('two', 'Two.md')];

vi.mock('../../contexts/VaultContext', () => ({
  useVault: () => ({
    favoriteNotes: favorites,
    noteIcons: { one: '⭐' },
    reorderFavorite: mocks.reorderFavorite,
    selectFile: mocks.selectFile,
    selectedFile: favorites[0],
    selectedVault: { id: 'vault', name: 'Vault' },
    toggleFavorite: mocks.toggleFavorite,
  }),
}));

import { FavoriteNotes } from './FavoriteNotes';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('FavoriteNotes', () => {
  it('is open by default and can be collapsed', () => {
    render(<FavoriteNotes />);

    expect(screen.getByRole('button', { name: 'One' })).toBeTruthy();
    expect(document.querySelector<HTMLImageElement>('.note-emoji .twemoji')?.src).toMatch(/\/2b50\.svg$/);
    fireEvent.click(screen.getByRole('button', { name: /Favourites/ }));
    expect(screen.queryByRole('button', { name: 'One' })).toBeNull();
  });

  it('opens and removes favourite notes', () => {
    render(<FavoriteNotes />);

    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    expect(mocks.selectFile).toHaveBeenCalledWith(favorites[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Two from favourites' }));
    expect(mocks.toggleFavorite).toHaveBeenCalledWith('two');
  });

  it('reorders notes with its isolated drag payload', () => {
    render(<FavoriteNotes />);

    const monitor = latestMonitor();
    act(() => monitor.onDragStart?.({ source: { data: { type: 'favorite-note', noteId: 'two' } } }));
    act(() => monitor.onDrop?.({
      location: {
        current: {
          dropTargets: [{ data: { type: 'favorite-destination', noteId: 'one', placement: 'before' } }],
        },
      },
      source: { data: { type: 'favorite-note', noteId: 'two' } },
    }));

    expect(mocks.reorderFavorite).toHaveBeenCalledWith('two', 'one', 'before');
  });
});

function latestMonitor() {
  type MonitorCallbacks = {
    onDragStart?: (event: { source: { data: Record<string, unknown> } }) => void;
    onDrop?: (event: {
      location: { current: { dropTargets: Array<{ data: Record<string, unknown> }> } };
      source: { data: Record<string, unknown> };
    }) => void;
  };
  const calls = mocks.monitorForElements.mock.calls as unknown as Array<[MonitorCallbacks]>;
  return calls.at(-1)?.[0] ?? {};
}

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
