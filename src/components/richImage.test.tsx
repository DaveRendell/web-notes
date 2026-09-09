import { MDXEditor, type MDXEditorMethods, headingsPlugin, listsPlugin, linkPlugin } from '@mdxeditor/editor';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../contexts/ThemeContext';
import { areMarkdownBodiesSemanticallyEquivalent } from '../lib/markdownEnvelope';
import RichMarkdownEditor from './RichMarkdownEditor';
import { richEditorEnhancementsPlugin } from './richEditorEnhancements';

afterEach(cleanup);
beforeEach(() => localStorage.setItem('web-notes:theme', 'light'));

describe('rich Markdown images', () => {
  it('preserves the games note constructs together', async () => {
    const source = '# 🎮 2023 Games\n\nPrevious years: [[Media/2022/2022 Games|🎮2022 Games]] [[Media/2021/2021 Games|🎮2021 Games]] \n\n[![](2023%20Games/mural.png)](2023%20Games/mural.png)\n\n### 👤 Single player\n\n1. 🧛 Vampire Survivors - 8 hours\n2. 💀 *Hades (true ending) - 22 hours*\n3. *💛 Celeste (C-Sides) - 6 hours*\n\n**Souls games:**\n\n11. Elden Ring\n12. Dark Souls\n13. Bloodborne';
    const ref = createRef<MDXEditorMethods>();
    render(<MDXEditor ref={ref} markdown={source} plugins={[headingsPlugin(), listsPlugin(), linkPlugin(), richEditorEnhancementsPlugin({ notes: [], recentNotes: [] })]} />);
    await waitFor(() => expect(document.querySelector('.rich-image-placeholder')).not.toBeNull());
    expect(ref.current?.getMarkdown()).toContain('11. Elden Ring');
    expect(areMarkdownBodiesSemanticallyEquivalent(source, ref.current!.getMarkdown())).toBe(true);
  });
  it('imports image embeds without changing their Markdown meaning', async () => {
    const source = 'Before\n\n![Diagram](assets/map.png "Map")\n\nAfter';
    const editorRef = createRef<MDXEditorMethods>();
    const { container } = render(
      <MDXEditor
        ref={editorRef}
        markdown={source}
        plugins={[richEditorEnhancementsPlugin({ notes: [], recentNotes: [] })]}
      />,
    );

    await waitFor(() => {
      const markdown = editorRef.current?.getMarkdown();
      expect(markdown).toBeDefined();
      expect(areMarkdownBodiesSemanticallyEquivalent(source, markdown!)).toBe(true);
    });
    expect(container.querySelector('.rich-image-placeholder')).not.toBeNull();
  });

  it.each([
    '![](Attachments/missing.png)',
    '![Diagram](<Attachments/missing image.png>)',
    '![Diagram](Attachments/missing.png "Original title")',
  ])('round-trips %s without a false normalization warning', async (source) => {
    const editorRef = createRef<MDXEditorMethods>();
    render(
      <MDXEditor
        ref={editorRef}
        markdown={source}
        plugins={[richEditorEnhancementsPlugin({ notes: [], recentNotes: [] })]}
      />,
    );

    await waitFor(() => expect(document.querySelector('.rich-image-placeholder')).not.toBeNull());
    expect(areMarkdownBodiesSemanticallyEquivalent(source, editorRef.current!.getMarkdown())).toBe(true);
  });

  it.each([
    ['an image-only note', '![Diagram](Attachments/missing.png)'],
    ['a vault image embed', '![[Attachments/missing.png]]'],
    ['text surrounding an image', 'Before\n\n![Diagram](Attachments/missing.png)\n\nAfter'],
  ])('does not emit empty Markdown while loading %s', async (_label, source) => {
    const onChange = vi.fn();
    const onInitialNormalize = vi.fn();
    render(
      <ThemeProvider>
        <RichMarkdownEditor
          markdown={source}
          notes={[]}
          onActiveChange={vi.fn()}
          onActivity={vi.fn()}
          onChange={onChange}
          onError={vi.fn()}
          onInitialNormalize={onInitialNormalize}
          onSave={vi.fn()}
          recentNotes={[]}
          spellCheck={false}
        />
      </ThemeProvider>,
    );

    if (source.includes('![') && !source.includes('![[')) {
      await waitFor(() => expect(document.querySelector('.rich-image-placeholder')).not.toBeNull());
    }
    expect(onChange).not.toHaveBeenCalledWith('');
    expect(onInitialNormalize).not.toHaveBeenCalledWith('');
  });
});
