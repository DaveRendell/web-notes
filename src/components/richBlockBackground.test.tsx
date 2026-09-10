import { MDXEditor, type MDXEditorMethods, headingsPlugin, listsPlugin, quotePlugin, codeBlockPlugin, tablePlugin, thematicBreakPlugin } from '@mdxeditor/editor';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { areMarkdownBodiesSemanticallyEquivalent, checkRichMarkdownCompatibility } from '../lib/markdownEnvelope';
import { richBlockBackgroundPlugin } from './richBlockBackground';
import { richBlockDragPlugin } from './richBlockDrag';

afterEach(cleanup);
function setup(markdown: string) {
  const ref = createRef<MDXEditorMethods>();
  const result = render(<div className="rich-markdown-editor-shell"><MDXEditor ref={ref} markdown={markdown}
    plugins={[headingsPlugin(), listsPlugin(), quotePlugin(), tablePlugin(), thematicBreakPlugin(), codeBlockPlugin(), richBlockBackgroundPlugin(), richBlockDragPlugin({ disabled: false })]} /></div>);
  return { ...result, ref };
}
describe('block backgrounds', () => {
  it.each([
    ['<!-- web-notes:background=yellow -->\nParagraph', 'p'],
    ['<!-- web-notes:background=yellow -->\n## Heading', 'h2'],
    ['- First <!-- web-notes:background=yellow -->\n- Second', 'li'],
    ['- [ ] Task <!-- web-notes:background=yellow -->\n  - Child', 'li'],
    ['<!-- web-notes:background=yellow -->\n> Quotation', 'blockquote'],
    ['<!-- web-notes:background=yellow -->\n| A | B |\n| - | - |\n| C | D |', '[data-lexical-decorator]'],
    ['<!-- web-notes:background=yellow -->\n---', '[data-lexical-decorator]'],
  ])('round trips %s', async (source, selector) => {
    const { container, ref } = setup(source);
    await waitFor(() => expect(container.querySelector(`${selector}[data-block-background="yellow"]`)).not.toBeNull());
    expect(checkRichMarkdownCompatibility(source).compatible).toBe(true);
    expect(areMarkdownBodiesSemanticallyEquivalent(source, ref.current!.getMarkdown())).toBe(true);
  });
  it('sets and clears a background through the grabber menu', async () => {
    const { container, ref } = setup('First\n\nSecond');
    async function open() {
      fireEvent.pointerMove(container.querySelector('p')!);
      fireEvent.click(await screen.findByRole('button', { name: 'Move block' }));
    }
    await open();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'blue background' }));
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain('<!-- web-notes:background=blue -->'));
    expect(container.querySelector('p')?.getAttribute('data-block-background')).toBe('blue');
    await open();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Default background' }));
    await waitFor(() => expect(ref.current!.getMarkdown()).toBe('First\n\nSecond'));
  });
  it('keeps annotations when moving a block', async () => {
    const { container, ref } = setup('<!-- web-notes:background=green -->\nFirst\n\nSecond');
    fireEvent.pointerMove(container.querySelector('p')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Move block' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => expect(ref.current!.getMarkdown()).toBe('Second\n\n<!-- web-notes:background=green -->\n\nFirst'));
  });
  it('does not whitelist arbitrary HTML or unknown colours', () => {
    expect(checkRichMarkdownCompatibility('<!-- web-notes:background=invalid -->\nText').compatible).toBe(false);
    expect(checkRichMarkdownCompatibility('<div>Text</div>').compatible).toBe(false);
  });
  it('does not copy a background to a new list item created with Enter', async () => {
    const { container, ref } = setup('- Coloured <!-- web-notes:background=blue -->');
    const item = container.querySelector('li')!;
    await waitFor(() => expect(item.dataset.blockBackground).toBe('blue'));

    const text = item.querySelector('[data-lexical-text]')!;
    fireEvent.click(text);
    const selection = window.getSelection()!;
    selection.collapse(text.firstChild!, text.textContent!.length);
    fireEvent.keyDown(container.querySelector('[contenteditable="true"]')!, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(container.querySelectorAll('li')).toHaveLength(2));
    expect(container.querySelectorAll('li')[0].dataset.blockBackground).toBe('blue');
    expect(container.querySelectorAll('li')[1].dataset.blockBackground).toBeUndefined();
    expect(ref.current!.getMarkdown()).toContain('Coloured <!-- web-notes:background=blue -->');
  });
  it('colours a list item without colouring its sibling and preserves it after moving', async () => {
    const { container, ref } = setup('- First\n- Second');
    fireEvent.pointerMove(container.querySelector('li')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Move block' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'pink background' }));
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain('First <!-- web-notes:background=pink -->'));
    expect(container.querySelectorAll('li')[1].hasAttribute('data-block-background')).toBe(false);
    fireEvent.pointerMove(container.querySelector('li')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Move block' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => expect(ref.current!.getMarkdown()).toMatch(/Second\n[*-] First <!-- web-notes:background=pink -->/));
  });
});
