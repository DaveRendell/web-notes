import { addComposerChild$, headingsPlugin, MDXEditor, type MDXEditorMethods, listsPlugin, quotePlugin, realmPlugin } from '@mdxeditor/editor';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $isElementNode, type LexicalEditor, type LexicalNode } from 'lexical';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveRichBlock, richBlockDragPlugin } from './richBlockDrag';

let lexicalEditor: LexicalEditor;
function CaptureEditor() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => { lexicalEditor = editor; }, [editor]);
  return null;
}
const captureEditorPlugin = realmPlugin({
  init(realm) { realm.pub(addComposerChild$, CaptureEditor); },
});

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
        plugins={[headingsPlugin(), quotePlugin(), listsPlugin(), richBlockDragPlugin({ disabled: false }), captureEditorPlugin()]}
      />
    </div>,
  );
  return { ...result, editorRef };
}

function findNode(text: string): LexicalNode | null {
  return lexicalEditor.getEditorState().read(() => {
    let found: LexicalNode | null = null;
    function walk(node: LexicalNode) {
      if (found) return;
      if (node.getTextContent() === text && ['listitem', 'paragraph', 'heading'].includes(node.getType())) found = node;
      if ($isElementNode(node)) node.getChildren().forEach(walk);
    }
    $getRoot().getChildren().forEach(walk);
    return found as LexicalNode | null;
  });
}

async function move(sourceText: string, targetText: string, placement: 'before' | 'after' | 'nest') {
  const source = findNode(sourceText);
  const target = findNode(targetText);
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  if (!source || !target) throw new Error('Expected source and target nodes');
  moveRichBlock(lexicalEditor, source.getKey(), target.getKey(), placement);
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

  it('dismisses the grabber menu with Escape or an outside click', async () => {
    const { container } = renderEditor('First');
    const paragraph = container.querySelector('p')!;
    await openBlockMenu(paragraph);
    const handle = screen.getByRole('button', { name: 'Move block' });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(handle));

    fireEvent.click(handle);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
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

  it('places an item after the target item’s complete subtree', async () => {
    const { editorRef } = renderEditor('- Source\n- Target\n  - Target child\n- After');
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await move('Source', 'Target', 'after');
    await waitFor(() => {
      const markdown = editorRef.current?.getMarkdown() ?? '';
      expect(markdown.indexOf('Target')).toBeLessThan(markdown.indexOf('Target child'));
      expect(markdown.indexOf('Target child')).toBeLessThan(markdown.indexOf('Source'));
      expect(markdown.indexOf('Source')).toBeLessThan(markdown.indexOf('After'));
    });
  });

  it('preserves list types when moving between unlike lists', async () => {
    const { editorRef } = renderEditor('- Bullet one\n- Bullet two\n\n1. Number one\n2. Number two');
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await move('Bullet one', 'Number two', 'before');
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(
      /[*-] Bullet two\n\n1\. Number one\n\n[*-] Bullet one\n\n1\. Number two/,
    ));
  });

  it('preserves a checklist item when moving it beside bullets', async () => {
    const { editorRef } = renderEditor('- [x] Done\n\nDivider\n\n- First\n- Second');
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await move('Done', 'Second', 'before');
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/[*-] First\n\n[*-] \[x\] Done\n\n[*-] Second/));
  });

  it.each([
    ['bullet', '- Source', 'numbered', '1. Target', /^\* Source$/m],
    ['bullet', '- Source', 'checklist', '- [ ] Target', /^\* Source$/m],
    ['numbered', '1. Source', 'bullet', '- Target', /^1\. Source$/m],
    ['numbered', '1. Source', 'checklist', '- [ ] Target', /^1\. Source$/m],
    ['checklist', '- [x] Source', 'bullet', '- Target', /^\* \[x\] Source$/m],
    ['checklist', '- [x] Source', 'numbered', '1. Target', /^\* \[x\] Source$/m],
  ])('keeps a %s item as %s when moved beside a %s item', async (_sourceLabel, source, _targetLabel, target, expected) => {
    const { editorRef } = renderEditor(`${source}\n\nDivider\n\n${target}`);
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await move('Source', 'Target', 'before');
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(expected));
  });

  it('preserves a numbered item when nesting it beneath a bullet', async () => {
    const { editorRef } = renderEditor('1. Numbered child\n\n- Parent');
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await move('Numbered child', 'Parent', 'nest');
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/[*-] Parent\n\s+1\. Numbered child/));
  });

  it('preserves nested list types and the complete dragged subtree', async () => {
    const { editorRef } = renderEditor('1. Numbered child\n   - Grandchild\n\n- Parent');
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await move('Numbered child', 'Parent', 'nest');
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(
      /[*-] Parent\n\s+1\. Numbered child\n\s+[*-] Grandchild/,
    ));
  });

  it('rejects moving a list item into its logical descendant', async () => {
    const { editorRef } = renderEditor('- Parent\n  1. Child');
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    const before = editorRef.current!.getMarkdown();
    await move('Parent', 'Child', 'nest');
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toBe(before));
  });

  it('nests a non-list block as continuation content without changing its type', async () => {
    const { editorRef } = renderEditor('Paragraph child\n\n- Parent');
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await move('Paragraph child', 'Parent', 'nest');
    await waitFor(() => {
      const markdown = editorRef.current?.getMarkdown() ?? '';
      expect(markdown).toMatch(/[*-] Parent/);
      expect(markdown).toContain('  Paragraph child');
      expect(markdown).not.toMatch(/\s+[*-] Paragraph child/);
    });
  });

  it('preserves a heading when nesting it as list continuation content', async () => {
    const { editorRef } = renderEditor('## Child heading\n\n- Parent');
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await move('Child heading', 'Parent', 'nest');
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/[*-] Parent\n\s+## Child heading/));
  });

  it('round-trips a nested continuation paragraph without flattening it into the item label', async () => {
    const source = '- Parent\n\n  Child paragraph';
    const { editorRef } = renderEditor(source);
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/[*-] Parent\n\n\s+Child paragraph/));
  });

  it('keeps a list item wrapped in its original list type beside a root block', async () => {
    const { editorRef } = renderEditor('1. Numbered\n\nParagraph');
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    await move('Numbered', 'Paragraph', 'after');
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/Paragraph\n\n1\. Numbered/));
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
