import { MDXEditor, type MDXEditorMethods, listsPlugin } from '@mdxeditor/editor';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  autoScroll: vi.fn(() => () => undefined),
  draggable: vi.fn(() => () => undefined),
  dropTarget: vi.fn(() => () => undefined),
  monitor: vi.fn(() => () => undefined),
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: mocks.draggable,
  dropTargetForElements: mocks.dropTarget,
  monitorForElements: mocks.monitor,
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
  autoScrollForElements: mocks.autoScroll,
}));

import { richBlockDragPlugin } from './richBlockDrag';

type DragRegistration = {
  getInitialData: () => Record<string, unknown>;
  onDragStart: () => void;
};

type DropRegistration = {
  getData: (args: {
    input: { clientY: number };
    source: { data: Record<string, unknown> };
  }) => Record<string, unknown>;
};

type MonitorRegistration = {
  onDrop: (args: {
    location: { current: { dropTargets: Array<{ data: Record<string, unknown> }> } };
    source: { data: Record<string, unknown> };
  }) => void;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('rich block gutter dragging', () => {
  it('adds a continuous drop rail beside the blocks for vertical-only dragging', async () => {
    const { container } = render(
      <div className="rich-markdown-editor-shell">
        <MDXEditor markdown={'First\n\nSecond'} plugins={[richBlockDragPlugin({ disabled: false })]} />
      </div>,
    );
    fireEvent.pointerMove(container.querySelector('p')!);
    await screen.findByRole('button', { name: 'Move block' });
    await waitFor(() => expect(mocks.draggable).toHaveBeenCalled());

    const registrations = (mocks.draggable as unknown as {
      mock: { calls: Array<[DragRegistration]> };
    }).mock.calls;
    const registration = registrations.at(-1)?.[0];
    expect(registration).toBeDefined();
    act(() => registration!.onDragStart());

    await waitFor(() => {
      expect(container.querySelectorAll('.rich-block-gutter-rail')).toHaveLength(1);
      expect(mocks.dropTarget).toHaveBeenCalledTimes(3);
    });
  });

  it('uses the gutter for reordering and reserves a narrow text zone for nesting', async () => {
    const { container } = render(
      <div className="rich-markdown-editor-shell">
        <MDXEditor markdown={'- First\n- Second'} plugins={[listsPlugin(), richBlockDragPlugin({ disabled: false })]} />
      </div>,
    );
    await waitFor(() => expect(container.querySelectorAll('li')).toHaveLength(2));
    const items = container.querySelectorAll('li');
    vi.spyOn(items[0], 'getBoundingClientRect').mockReturnValue(blockRect(0, 100));
    vi.spyOn(items[1], 'getBoundingClientRect').mockReturnValue(blockRect(100, 200));
    fireEvent.pointerMove(items[0]);
    await screen.findByRole('button', { name: 'Move block' });
    await waitFor(() => expect(mocks.draggable).toHaveBeenCalled());

    const dragCalls = (mocks.draggable as unknown as {
      mock: { calls: Array<[DragRegistration]> };
    }).mock.calls;
    const drag = dragCalls.at(-1)?.[0];
    expect(drag).toBeDefined();
    act(() => drag!.onDragStart());
    await waitFor(() => expect(container.querySelector('.rich-block-gutter-rail')).not.toBeNull());

    const dropCalls = (mocks.dropTarget as unknown as {
      mock: { calls: Array<[DropRegistration]> };
    }).mock.calls;
    const source = { data: drag!.getInitialData() };
    expect(dropCalls[1][0].getData({ input: { clientY: 150 }, source }).placement).toBe('nest');
    expect(dropCalls.at(-1)![0].getData({ input: { clientY: 150 }, source }).placement).toBe('after');
    expect(dropCalls[1][0].getData({ input: { clientY: 135 }, source }).placement).toBe('before');
  });

  it('preserves the source marker when moving an item into a different list type', async () => {
    const editorRef = createRef<MDXEditorMethods>();
    const { container } = render(
      <div className="rich-markdown-editor-shell">
        <MDXEditor
          ref={editorRef}
          markdown={'- Bullet\n\n1. Number'}
          plugins={[listsPlugin(), richBlockDragPlugin({ disabled: false })]}
        />
      </div>,
    );
    await waitFor(() => expect(container.querySelectorAll('li')).toHaveLength(2));
    const items = container.querySelectorAll('li');
    vi.spyOn(items[0], 'getBoundingClientRect').mockReturnValue(blockRect(0, 100));
    vi.spyOn(items[1], 'getBoundingClientRect').mockReturnValue(blockRect(100, 200));
    fireEvent.pointerMove(items[0]);
    await screen.findByRole('button', { name: 'Move block' });
    await waitFor(() => expect(mocks.draggable).toHaveBeenCalled());

    const dragCalls = (mocks.draggable as unknown as {
      mock: { calls: Array<[DragRegistration]> };
    }).mock.calls;
    const dropCalls = (mocks.dropTarget as unknown as {
      mock: { calls: Array<[DropRegistration]> };
    }).mock.calls;
    const monitorCalls = (mocks.monitor as unknown as {
      mock: { calls: Array<[MonitorRegistration]> };
    }).mock.calls;
    const source = { data: dragCalls.at(-1)![0].getInitialData() };
    const targetData = dropCalls[1][0].getData({ input: { clientY: 190 }, source });

    act(() => monitorCalls[0][0].onDrop({
      location: { current: { dropTargets: [{ data: targetData }] } },
      source,
    }));

    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/^1\. Number\n\n[*+-] Bullet$/));
  });
});

function blockRect(top: number, bottom: number) {
  return {
    bottom,
    height: bottom - top,
    left: 100,
    right: 300,
    top,
    width: 200,
    x: 100,
    y: top,
    toJSON: () => ({}),
  };
}
