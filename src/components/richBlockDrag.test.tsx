import { MDXEditor, type MDXEditorMethods, listsPlugin } from '@mdxeditor/editor';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { richBlockDragPlugin } from './richBlockDrag';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEditor(markdown: string) {
  const editorRef = createRef<MDXEditorMethods>();
  const result = render(
    <div className="rich-markdown-editor-shell">
      <MDXEditor
        ref={editorRef}
        markdown={markdown}
        plugins={[listsPlugin(), richBlockDragPlugin({ disabled: false })]}
      />
    </div>,
  );
  return { ...result, editorRef };
}

async function openBlockMenu(element: Element) {
  fireEvent.pointerMove(element);
  const handle = await screen.findByRole('button', { name: 'Move block' });
  fireEvent.click(handle);
}

describe('rich block movement', () => {
  it('moves top-level blocks through the accessible grabber menu', async () => {
    const { container, editorRef } = renderEditor('First\n\nSecond');
    const paragraphs = container.querySelectorAll('p');
    await openBlockMenu(paragraphs[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));

    await waitFor(() => expect(editorRef.current?.getMarkdown()).toBe('Second\n\nFirst'));
  });

  it('moves individual list items and carries their nested subtree', async () => {
    const { container, editorRef } = renderEditor('- Parent\n  - Child\n- Sibling');
    const items = container.querySelectorAll('li');
    await openBlockMenu(items[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));

    await waitFor(() => {
      const markdown = editorRef.current?.getMarkdown() ?? '';
      expect(markdown.indexOf('Sibling')).toBeLessThan(markdown.indexOf('Parent'));
      expect(markdown.indexOf('Parent')).toBeLessThan(markdown.indexOf('Child'));
    });
  });

  it('supports indenting, outdenting, and deleting list items', async () => {
    const { container, editorRef } = renderEditor('- First\n- Second');
    let items = container.querySelectorAll('li');
    await openBlockMenu(items[1]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Indent' }));
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/First\n\s+[*-] Second/));

    items = container.querySelectorAll('li');
    await openBlockMenu(items[items.length - 1]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Outdent' }));
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/^[*-] First\n[*-] Second$/));

    items = container.querySelectorAll('li');
    await openBlockMenu(items[1]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete block' }));
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/^[*-] First$/));
  });

  it('disables the grabber while note movement is unavailable', async () => {
    const { container } = render(
      <div className="rich-markdown-editor-shell">
        <MDXEditor markdown="Body" plugins={[richBlockDragPlugin({ disabled: true })]} />
      </div>,
    );
    fireEvent.pointerMove(container.querySelector('p')!);
    expect((await screen.findByRole('button', { name: 'Move block' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reveals and vertically aligns a grabber when the pointer is in its gutter', async () => {
    const { container } = renderEditor('First\n\nSecond');
    const paragraph = container.querySelector('p')!;
    paragraph.style.lineHeight = '32px';
    vi.spyOn(paragraph, 'getBoundingClientRect').mockReturnValue({
      bottom: 132,
      height: 32,
      left: 100,
      right: 300,
      top: 100,
      width: 200,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(container.querySelector('.rich-markdown-editor-shell')!, { clientX: 80, clientY: 110 });
    const handle = await screen.findByRole('button', { name: 'Move block' });
    expect((handle.closest('.rich-block-controls') as HTMLElement).style.transform).toBe('translate(70px, 102px)');
  });

  it('compensates for checklist marker positioning', async () => {
    const { container } = renderEditor('- [ ] Task');
    const item = container.querySelector('li')!;
    item.style.lineHeight = '20px';
    item.style.marginInlineStart = '-16px';
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 20,
      left: 124,
      right: 300,
      top: 100,
      width: 176,
      x: 124,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(container.querySelector('.rich-markdown-editor-shell')!, { clientX: 80, clientY: 110 });
    const handle = await screen.findByRole('button', { name: 'Move block' });
    expect((handle.closest('.rich-block-controls') as HTMLElement).style.transform).toBe('translate(70px, 96px)');
  });

});
