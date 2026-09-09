import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../../types/vault';

const mocks = vi.hoisted(() => ({
  draggable: vi.fn(() => () => undefined),
  dropTargetForElements: vi.fn(() => () => undefined),
  monitorForElements: vi.fn(() => () => undefined),
  moveNode: vi.fn(),
  toggleFavorite: vi.fn(),
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: mocks.draggable,
  dropTargetForElements: mocks.dropTargetForElements,
  monitorForElements: mocks.monitorForElements,
}));

const tree = [
  folder('folder-a', 'Folder A', 'Folder A', [
    folder('folder-b', 'Folder B', 'Folder A/Folder B'),
    note('note', 'Note.md', 'Folder A/Note.md'),
  ]),
  folder('folder-c', 'Folder C', 'Folder C'),
];

vi.mock('../../contexts/VaultContext', () => ({
  useVault: () => ({
    createFolder: vi.fn(),
    createNote: vi.fn(),
    deleteFolder: vi.fn(),
    deleteNote: vi.fn(),
    favoriteNoteIds: [],
    isOnline: true,
    moveNode: mocks.moveNode,
    noteIcons: { note: '📝' },
    renameFolder: vi.fn(),
    renameNote: vi.fn(),
    selectFile: vi.fn(),
    selectedFile: null,
    toggleFavorite: mocks.toggleFavorite,
    tree,
  }),
}));

import { FileTree } from './FileTree';
import { getVaultDragData, getVaultDropData, ROOT_DROP_TARGET } from './FileTreeDndContext';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('FileTree drag and drop', () => {
  it('does not keep closed action menus in the scrollable tree layout', () => {
    const { container } = render(<FileTree nodes={tree} />);
    expect(container.querySelector('.dropdown-popover')).toBeNull();
  });

  it('uses a cached emoji in place of the generic note icon', () => {
    const { container } = render(<FileTree nodes={tree} />);
    fireEvent.click(screen.getByRole('button', { name: 'Folder A' }));

    expect(container.querySelector<HTMLImageElement>('.note-emoji .twemoji')?.src).toMatch(/\/1f4dd\.svg$/);
  });

  it('keeps folder actions in a compact overflow menu', () => {
    render(<FileTree nodes={tree} />);

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Folder A' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'New note',
      'New folder',
      'Rename',
      'Delete folder',
    ]);
  });

  it('adds a note to favourites from its overflow menu', () => {
    render(<FileTree nodes={tree} />);

    fireEvent.click(screen.getByRole('button', { name: 'Folder A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Note' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add favourite' }));

    expect(mocks.toggleFavorite).toHaveBeenCalledWith('note');
  });

  it('offers valid destinations through the keyboard move dialog', () => {
    render(<FileTree nodes={tree} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Folder A' }));
    const options = screen.queryAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Folder C']);
  });

  it('collapses a dragged folder and restores it when the drag is cancelled', async () => {
    render(<FileTree nodes={tree} />);
    fireEvent.click(screen.getByRole('button', { name: 'Folder A' }));
    expect(screen.getByRole('button', { name: 'Move Note' })).toBeTruthy();

    act(() => latestMonitor().onDragStart?.({ source: { data: getVaultDragData('folder-a') } }));
    expect(screen.queryByRole('button', { name: 'Move Note' })).toBeNull();
    expect(screen.getByText('Already in vault root')).toBeTruthy();

    act(() =>
      latestMonitor().onDrop?.({
        location: { current: { dropTargets: [] } },
        source: { data: getVaultDragData('folder-a') },
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Note' })).toBeTruthy());
    expect(mocks.moveNode).not.toHaveBeenCalled();
  });

  it('moves a nested note to the root using the root drop target', async () => {
    mocks.moveNode.mockResolvedValue(note('note', 'Note.md', 'Note.md'));
    render(<FileTree nodes={tree} />);

    act(() => latestMonitor().onDragStart?.({ source: { data: getVaultDragData('note') } }));
    const rootData = getVaultDropData(ROOT_DROP_TARGET);
    act(() =>
      latestMonitor().onDrop?.({
        location: { current: { dropTargets: [{ data: rootData }] } },
        source: { data: getVaultDragData('note') },
      }),
    );

    await waitFor(() => expect(mocks.moveNode).toHaveBeenCalledWith(tree[0].children?.[1], null));
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

function note(id: string, name: string, path: string): VaultNode {
  return { id, mimeType: 'text/markdown', name, path, source: { id, mimeType: 'text/markdown', name }, type: 'markdown' };
}

function folder(id: string, name: string, path: string, children: VaultNode[] = []): VaultNode {
  return {
    children,
    id,
    mimeType: 'application/vnd.google-apps.folder',
    name,
    path,
    source: { id, mimeType: 'application/vnd.google-apps.folder', name },
    type: 'folder',
  };
}
