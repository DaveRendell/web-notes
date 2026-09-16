import { headingsPlugin, MDXEditor, type MDXEditorMethods, listsPlugin } from '@mdxeditor/editor';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { richBlockTouchDragPlugin } from './richBlockTouchDrag';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

function rect(top: number): DOMRect {
  return { top, bottom: top + 30, left: 20, right: 320, height: 30, width: 300 } as DOMRect;
}

async function renderEditor() {
  const editorRef = createRef<MDXEditorMethods>();
  const view = render(
    <MDXEditor
      ref={editorRef}
      markdown={'First paragraph.\n\nSecond paragraph.'}
      plugins={[headingsPlugin(), listsPlugin(), richBlockTouchDragPlugin()]}
    />,
  );
  await waitFor(() => expect(view.container.querySelectorAll('p')).toHaveLength(2));
  const [first, second] = Array.from(view.container.querySelectorAll('p'));
  vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(rect(100));
  vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(rect(200));
  return { ...view, editorRef, first, second };
}

describe('Android touch block gesture', () => {
  it('leaves scrolling and short touches untouched', async () => {
    const { first, editorRef } = await renderEditor();
    const editable = first.closest('[contenteditable="true"]')!;
    vi.useFakeTimers();
    fireEvent.touchStart(first, { touches: [{ clientX: 40, clientY: 110 }] });
    expect(editable.classList.contains('rich-touch-drag-pending')).toBe(true);
    const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
    first.dispatchEvent(selectStart);
    expect(selectStart.defaultPrevented).toBe(true);
    fireEvent.touchMove(first, { touches: [{ clientX: 40, clientY: 140 }] });
    act(() => vi.advanceTimersByTime(500));
    expect(first.classList.contains('rich-touch-drag-source')).toBe(false);
    expect(editable.classList.contains('rich-touch-drag-pending')).toBe(false);
    const resumedSelection = new Event('selectstart', { bubbles: true, cancelable: true });
    first.dispatchEvent(resumedSelection);
    expect(resumedSelection.defaultPrevented).toBe(false);
    fireEvent.touchEnd(first, { touches: [], changedTouches: [{ clientX: 40, clientY: 140 }] });
    expect(editorRef.current?.getMarkdown()).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('moves a block after long-press and release on a valid target', async () => {
    const { first, second, editorRef } = await renderEditor();
    vi.useFakeTimers();
    fireEvent.touchStart(first, { touches: [{ clientX: 40, clientY: 110 }] });
    act(() => vi.advanceTimersByTime(460));
    expect(first.classList.contains('rich-touch-drag-source')).toBe(true);
    fireEvent.touchMove(first, { touches: [{ clientX: 40, clientY: 225 }] });
    expect(second.classList.contains('rich-touch-drop-after')).toBe(true);
    fireEvent.touchEnd(first, { touches: [], changedTouches: [{ clientX: 40, clientY: 225 }] });
    vi.useRealTimers();
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toBe('Second paragraph.\n\nFirst paragraph.'));
    expect(second.classList.contains('rich-touch-drop-after')).toBe(false);
  });
});
