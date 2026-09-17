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

async function renderEditor(disabled = false) {
  const editorRef = createRef<MDXEditorMethods>();
  const view = render(
    <MDXEditor
      ref={editorRef}
      markdown={'First paragraph.\n\nSecond paragraph.'}
      plugins={[headingsPlugin(), listsPlugin(), richBlockTouchDragPlugin({ disabled })]}
    />,
  );
  await waitFor(() => expect(view.container.querySelectorAll('p')).toHaveLength(2));
  const [first, second] = Array.from(view.container.querySelectorAll('p'));
  vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(rect(100));
  vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(rect(200));
  return { ...view, editorRef, first, second };
}

describe('Android touch block gesture', () => {
  it('moves blocks while Lexical is read-only, without enabling native text selection', async () => {
    const editorRef = createRef<MDXEditorMethods>();
    const onChange = vi.fn();
    const view = render(
      <MDXEditor
        ref={editorRef}
        readOnly
        markdown={'First paragraph.\n\nSecond paragraph.'}
        onChange={onChange}
        plugins={[headingsPlugin(), listsPlugin(), richBlockTouchDragPlugin()]}
      />,
    );
    await waitFor(() => expect(view.container.querySelectorAll('p')).toHaveLength(2));
    const [first, second] = Array.from(view.container.querySelectorAll('p'));
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(rect(100));
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(rect(200));
    expect(first.closest('[contenteditable]')?.getAttribute('contenteditable')).toBe('false');
    vi.useFakeTimers();
    fireEvent.touchStart(first, { touches: [{ clientX: 40, clientY: 110 }] });
    act(() => vi.advanceTimersByTime(460));
    fireEvent.touchMove(first, { touches: [{ clientX: 40, clientY: 225 }] });
    fireEvent.touchEnd(first, { touches: [], changedTouches: [{ clientX: 40, clientY: 225 }] });
    vi.useRealTimers();
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toBe('Second paragraph.\n\nFirst paragraph.'));
    expect(onChange).toHaveBeenCalledWith('Second paragraph.\n\nFirst paragraph.', false);
  });

  it('leaves long-press text selection available while the caret is focused', async () => {
    const { first, editorRef } = await renderEditor();
    const editable = first.closest<HTMLElement>('[contenteditable="true"]')!;
    editable.focus();
    expect(document.activeElement).toBe(editable);
    vi.useFakeTimers();
    fireEvent.touchStart(first, { touches: [{ clientX: 40, clientY: 110 }] });
    act(() => vi.advanceTimersByTime(500));
    expect(editable.classList.contains('rich-touch-drag-pending')).toBe(false);
    expect(first.classList.contains('rich-touch-drag-source')).toBe(false);
    const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
    first.dispatchEvent(selectStart);
    expect(selectStart.defaultPrevented).toBe(false);
    expect(editorRef.current?.getMarkdown()).toBe('First paragraph.\n\nSecond paragraph.');
    editable.blur();
    fireEvent.touchStart(first, { touches: [{ clientX: 40, clientY: 110 }] });
    expect(editable.classList.contains('rich-touch-drag-pending')).toBe(true);
    fireEvent.touchEnd(first, { touches: [], changedTouches: [{ clientX: 40, clientY: 110 }] });
  });

  it('does not start a drag while the on-screen keyboard is reported visible', async () => {
    const { first, editorRef } = await renderEditor(true);
    const editable = first.closest('[contenteditable="true"]')!;
    vi.useFakeTimers();
    fireEvent.touchStart(first, { touches: [{ clientX: 40, clientY: 110 }] });
    act(() => vi.advanceTimersByTime(500));
    expect(editable.classList.contains('rich-touch-drag-pending')).toBe(false);
    expect(first.classList.contains('rich-touch-drag-source')).toBe(false);
    const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
    first.dispatchEvent(selectStart);
    expect(selectStart.defaultPrevented).toBe(false);
    expect(editorRef.current?.getMarkdown()).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('cancels a pending drag if the keyboard opens before the hold completes', async () => {
    const { first, rerender, editorRef } = await renderEditor();
    const editable = first.closest('[contenteditable="true"]')!;
    vi.useFakeTimers();
    fireEvent.touchStart(first, { touches: [{ clientX: 40, clientY: 110 }] });
    expect(editable.classList.contains('rich-touch-drag-pending')).toBe(true);
    rerender(
      <MDXEditor
        ref={editorRef}
        markdown={'First paragraph.\n\nSecond paragraph.'}
        plugins={[headingsPlugin(), listsPlugin(), richBlockTouchDragPlugin({ disabled: true })]}
      />,
    );
    act(() => vi.advanceTimersByTime(500));
    expect(editable.classList.contains('rich-touch-drag-pending')).toBe(false);
    expect(first.classList.contains('rich-touch-drag-source')).toBe(false);
    const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
    first.dispatchEvent(selectStart);
    expect(selectStart.defaultPrevented).toBe(false);
    expect(editorRef.current?.getMarkdown()).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('keeps a gesture eligible when the touch itself briefly focuses the editor', async () => {
    const { first } = await renderEditor();
    const editable = first.closest<HTMLElement>('[contenteditable="true"]')!;
    vi.useFakeTimers();
    fireEvent.touchStart(first, { touches: [{ clientX: 40, clientY: 110 }] });
    expect(editable.classList.contains('rich-touch-drag-pending')).toBe(true);
    editable.focus();
    act(() => vi.advanceTimersByTime(460));
    expect(first.classList.contains('rich-touch-drag-source')).toBe(true);
    fireEvent.touchEnd(first, { touches: [], changedTouches: [{ clientX: 40, clientY: 110 }] });
  });

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
