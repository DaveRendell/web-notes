import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMarkdownBlocks } from '../lib/markdownBlocks';

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

import { MarkdownBlockDndProvider, MarkdownBlockShell } from './MarkdownBlockDnd';

type DragRegistration = {
  dragHandle: HTMLElement;
  getInitialData: () => Record<string, unknown>;
};

type DropRegistration = {
  element: HTMLElement;
  getData: (args: { input: { clientY: number }; source: { data: Record<string, unknown> } }) => Record<string, unknown>;
};

type MonitorRegistration = {
  onDragStart: (args: { source: { data: Record<string, unknown> } }) => void;
  onDrag: (args: { location: { current: { dropTargets: Array<{ data: Record<string, unknown> }> } } }) => void;
  onDrop: (args: {
    source: { data: Record<string, unknown> };
    location: { current: { dropTargets: Array<{ data: Record<string, unknown> }> } };
  }) => void;
};

function mockArgument<T>(mock: unknown, callIndex = 0): T {
  return (mock as { mock: { calls: unknown[][] } }).mock.calls[callIndex][0] as T;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MarkdownBlockDnd', () => {
  it('registers handle-only drags, nested targets, and vertical auto-scroll', () => {
    const model = parseMarkdownBlocks('Alpha\n\nBeta\n');
    render(
      <MarkdownBlockDndProvider
        disabled={false}
        document={model}
        onDelete={() => undefined}
        onMove={() => undefined}
        scrollElementRef={{ current: document.body }}
      >
        {model.blocks.map((block) => <MarkdownBlockShell key={block.id} blockId={block.id}><p>{block.id}</p></MarkdownBlockShell>)}
      </MarkdownBlockDndProvider>,
    );

    expect(mocks.draggable).toHaveBeenCalledTimes(2);
    expect(mockArgument<DragRegistration>(mocks.draggable).dragHandle).toBeInstanceOf(HTMLButtonElement);
    expect(mocks.dropTarget).toHaveBeenCalledTimes(2);
    expect(mocks.autoScroll).toHaveBeenCalledWith(expect.objectContaining({ element: document.body }));
    expect(mockArgument<{ getAllowedAxis: () => string }>(mocks.autoScroll).getAllowedAxis()).toBe('vertical');
  });

  it('reports the effective drop operation through the shared monitor', () => {
    const onMove = vi.fn();
    const model = parseMarkdownBlocks('Alpha\n\nBeta\n');
    render(
      <MarkdownBlockDndProvider
        disabled={false}
        document={model}
        onDelete={() => undefined}
        onMove={onMove}
        scrollElementRef={{ current: document.body }}
      >
        {model.blocks.map((block) => <MarkdownBlockShell key={block.id} blockId={block.id}><p>{block.id}</p></MarkdownBlockShell>)}
      </MarkdownBlockDndProvider>,
    );

    const sourceData = mockArgument<DragRegistration>(mocks.draggable).getInitialData();
    const targetRegistration = mockArgument<DropRegistration>(mocks.dropTarget, 1);
    const targetElement = targetRegistration.element;
    vi.spyOn(targetElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const targetData = targetRegistration.getData({
      input: { clientY: 90 },
      source: { data: sourceData },
    });
    const monitor = mockArgument<MonitorRegistration>(mocks.monitor);

    act(() => monitor.onDragStart({ source: { data: sourceData } }));
    act(() => monitor.onDrag({ location: { current: { dropTargets: [{ data: targetData }] } } }));
    expect(targetElement.className).toContain('drop-after');
    act(() => monitor.onDrop({
      source: { data: sourceData },
      location: { current: { dropTargets: [{ data: targetData }] } },
    }));

    expect(onMove).toHaveBeenCalledWith({
      sourceId: model.blocks[0].id,
      targetId: model.blocks[1].id,
      placement: 'after',
    });
  });
});
