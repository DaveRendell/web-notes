import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../types/vault';

const files = vi.hoisted(() => [note('one', 'One.md'), note('two', 'Two.md')]);
const mocks = vi.hoisted(() => ({
  activateFileTab: vi.fn(),
  autoScroll: vi.fn(() => () => undefined),
  closeFileTab: vi.fn(),
  draggable: vi.fn(() => () => undefined),
  dropTargetForElements: vi.fn(() => () => undefined),
  monitorForElements: vi.fn(() => () => undefined),
  reorderFileTab: vi.fn(),
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({ autoScrollForElements: mocks.autoScroll }));
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: mocks.draggable,
  dropTargetForElements: mocks.dropTargetForElements,
  monitorForElements: mocks.monitorForElements,
}));

vi.mock('../contexts/VaultContext', () => ({
  useVault: () => ({
    activateFileTab: mocks.activateFileTab,
    closeFileTab: mocks.closeFileTab,
    noteIcons: { one: '📝' },
    openFiles: files,
    reorderFileTab: mocks.reorderFileTab,
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

  it('reorders tabs using isolated horizontal drag targets', () => {
    const { container } = render(<FileTabs />);
    const monitor = latestMonitor();
    act(() => monitor.onDragStart?.({ source: { data: { type: 'web-notes-file-tab', fileId: 'two' } } }));
    act(() => monitor.onDrag?.({
      location: { current: { dropTargets: [{ data: { type: 'web-notes-file-tab-destination', fileId: 'one', placement: 'before' } }] } },
    }));
    expect(container.querySelectorAll('.file-tab')[1].classList.contains('dragging')).toBe(true);
    expect(container.querySelectorAll('.file-tab')[0].classList.contains('drop-before')).toBe(true);

    act(() => monitor.onDrop?.({
      source: { data: { type: 'web-notes-file-tab', fileId: 'two' } },
      location: { current: { dropTargets: [{ data: { type: 'web-notes-file-tab-destination', fileId: 'one', placement: 'before' } }] } },
    }));
    expect(mocks.reorderFileTab).toHaveBeenCalledWith('two', 'one', 'before');
    expect(mocks.autoScroll).toHaveBeenCalledWith(expect.objectContaining({ element: container.querySelector('.file-tabs') }));
  });
});

function latestMonitor() {
  type MonitorCallbacks = {
    onDragStart?: (event: { source: { data: Record<string, unknown> } }) => void;
    onDrag?: (event: { location: { current: { dropTargets: Array<{ data: Record<string, unknown> }> } } }) => void;
    onDrop?: (event: {
      source: { data: Record<string, unknown> };
      location: { current: { dropTargets: Array<{ data: Record<string, unknown> }> } };
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
