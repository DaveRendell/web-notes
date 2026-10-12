import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MDXEditor,
  type MDXEditorMethods,
  addComposerChild$,
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  realmPlugin,
} from '@mdxeditor/editor';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $getRoot, $getSelection, $isRangeSelection, $isElementNode, $isTextNode, INSERT_PARAGRAPH_COMMAND, PASTE_COMMAND, type LexicalEditor } from 'lexical';
import {
  emojiTrigger,
  richEditorEnhancementsPlugin,
  slashCommandTrigger,
  wikiLinkTrigger,
} from './richEditorEnhancements';

afterEach(cleanup);

let lexicalEditor: LexicalEditor;
function CaptureEditor() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => { lexicalEditor = editor; }, [editor]);
  return null;
}
const captureEditorPlugin = realmPlugin({
  init(realm) { realm.pub(addComposerChild$, CaptureEditor); },
});

function SelectEditorStart() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.update(() => $getRoot().selectStart()), [editor]);
  return null;
}

function SelectEditorEnd() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.update(() => $getRoot().selectEnd()), [editor]);
  return null;
}

const selectEditorStartPlugin = realmPlugin({
  init(realm) {
    realm.pub(addComposerChild$, SelectEditorStart);
  },
});

const selectEditorEndPlugin = realmPlugin({
  init(realm) {
    realm.pub(addComposerChild$, SelectEditorEnd);
  },
});

describe('rich editor enhancements', () => {
  it('keeps Ctrl+L on the new empty item before an existing checklist', async () => {
    const { container } = render(<MDXEditor markdown={'Above\n\n- [ ] Below'} plugins={[
      listsPlugin(), richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }), captureEditorPlugin(),
    ]} />);
    lexicalEditor.update(() => {
      const paragraph = $createParagraphNode();
      $getRoot().getFirstChildOrThrow().insertAfter(paragraph);
      paragraph.selectStart();
    }, { discrete: true });
    fireEvent.keyDown(container.querySelector('[contenteditable="true"]')!, { key: 'l', ctrlKey: true });
    await waitFor(() => lexicalEditor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection) && selection.anchor.getNode().getType()).toBe('listitem');
      expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe('');
      expect($isRangeSelection(selection) && selection.anchor.offset).toBe(0);
    }));
  });
  it('preserves paragraph indentation after Enter', async () => {
    render(<MDXEditor markdown="Indented" plugins={[
      richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }), captureEditorPlugin(),
    ]} />);
    lexicalEditor.update(() => {
      const block = $getRoot().getFirstChildOrThrow();
      if ($isElementNode(block)) { block.setIndent(2); block.selectEnd(); }
    }, { discrete: true });
    lexicalEditor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    await waitFor(() => lexicalEditor.getEditorState().read(() => {
      const blocks = $getRoot().getChildren();
      expect(blocks).toHaveLength(2);
      expect($isElementNode(blocks[1]) && blocks[1].getIndent()).toBe(2);
    }));
  });
  it('pastes a URL as a link around selected text without replacing the label', async () => {
    const ref = createRef<MDXEditorMethods>();
    render(<MDXEditor ref={ref} markdown="Selected label" plugins={[
      linkPlugin(), richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }), captureEditorPlugin(),
    ]} />);
    lexicalEditor.update(() => {
      const block = $getRoot().getFirstChildOrThrow();
      const text = $isElementNode(block) ? block.getFirstDescendant() : null;
      if ($isTextNode(text)) text.select(0, 8);
    }, { discrete: true });
    const preventDefault = vi.fn();
    lexicalEditor.dispatchCommand(PASTE_COMMAND, {
      clipboardData: { getData: () => 'https://example.com/page' }, preventDefault,
    } as unknown as ClipboardEvent);
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('[Selected](https://example.com/page) label'));
    expect(preventDefault).toHaveBeenCalled();
  });
  it.each([
    ['[[pro', { leadOffset: 0, matchingString: 'pro', replaceableString: '[[pro' }],
    ['See [[Project plan', { leadOffset: 4, matchingString: 'Project plan', replaceableString: '[[Project plan' }],
    ['![[embed', null],
    ['[[note|alias', null],
    ['[[note#heading', null],
  ])('detects wikilink query %s', (text, expected) => {
    expect(wikiLinkTrigger(text, null!)).toEqual(expected);
  });

  it.each([
    [':roc', { leadOffset: 0, matchingString: 'roc', replaceableString: ':roc' }],
    ['text:rocket', { leadOffset: 4, matchingString: 'rocket', replaceableString: ':rocket' }],
    [':two words', null],
    ['ordinary:', null],
  ])('detects emoji query %s without treating ordinary colons as triggers', (text, expected) => {
    expect(emojiTrigger(text, null!)).toEqual(expected);
  });

  it.each([
    ['/', { leadOffset: 0, matchingString: '', replaceableString: '/' }],
    ['/hea', { leadOffset: 0, matchingString: 'hea', replaceableString: '/hea' }],
    ['  /todo', { leadOffset: 2, matchingString: 'todo', replaceableString: '/todo' }],
    ['text /todo', { leadOffset: 5, matchingString: 'todo', replaceableString: '/todo' }],
    ['https://example.com', null],
  ])('detects slash command query %s at a block start or after whitespace', (text, expected) => {
    expect(slashCommandTrigger(text, null!)).toEqual(expected);
  });

  it('runs a slash command and removes the typed trigger', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(20, 20, 1, 18),
    });
    const editorRef = createRef<MDXEditorMethods>();
    render(
      <MDXEditor
        ref={editorRef}
        markdown="Existing /heading"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }),
          selectEditorEndPlugin(),
        ]}
      />,
    );

    fireEvent.click(await screen.findByRole('option', { name: /Heading 1/i }));
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toMatch(/^# Existing(?: |&#x20;)$/));
  });

  it('limits the rich slash menu to commands supported by the host', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(20, 20, 1, 18),
    });
    render(
      <MDXEditor
        markdown="/"
        plugins={[
          headingsPlugin(),
          richEditorEnhancementsPlugin({ notes: [], recentNotes: [], slashCommandIds: new Set(['heading', 'green']) }),
          selectEditorEndPlugin(),
        ]}
      />,
    );

    expect(await screen.findByRole('option', { name: /Heading 1/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Green background/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Image/i })).toBeNull();
    expect(screen.queryByRole('option', { name: /Calendar/i })).toBeNull();
  });

  it('round-trips wikilink targets and aliases without escaping them', async () => {
    const editorRef = createRef<MDXEditorMethods>();
    render(
      <MDXEditor
        ref={editorRef}
        markdown={'See [[Folder/Note]] and [[People/Ada|Ada Lovelace]].'}
        plugins={[
          linkPlugin(),
          listsPlugin(),
          richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }),
        ]}
      />,
    );

    await waitFor(() => expect(editorRef.current).not.toBeNull());
    expect(editorRef.current?.getMarkdown()).toBe(
      'See [[Folder/Note]] and [[People/Ada|Ada Lovelace]].',
    );
  });

  it('renders compound emoji as Twemoji without changing Markdown or formatting', async () => {
    const editorRef = createRef<MDXEditorMethods>();
    const { container } = render(
      <MDXEditor
        ref={editorRef}
        markdown={'# 👩🏽‍💻 Notes\n\n**Important 📝 text**'}
        plugins={[
          headingsPlugin(),
          linkPlugin(),
          listsPlugin(),
          richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }),
        ]}
      />,
    );

    await waitFor(() => expect(container.querySelectorAll('.rich-emoji-node .twemoji')).toHaveLength(2));
    expect(editorRef.current?.getMarkdown()).toBe('# 👩🏽‍💻 Notes\n\n**Important 📝 text**');
  });

  it('uses Ctrl+L to create and then toggle a checklist item', async () => {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(),
    });
    const editorRef = createRef<MDXEditorMethods>();
    const { container } = render(
      <MDXEditor
        ref={editorRef}
        markdown="Task"
        plugins={[
          listsPlugin(),
          richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }),
          selectEditorStartPlugin(),
        ]}
      />,
    );
    const editor = container.querySelector<HTMLElement>('[contenteditable="true"]')!;
    editor.focus();

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'l' });
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toContain('[ ] Task'));

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'l' });
    await waitFor(() => expect(editorRef.current?.getMarkdown()).toContain('[x] Task'));
  });

  it('converts only the current ordinary list item to a checklist', async () => {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(),
    });
    const editorRef = createRef<MDXEditorMethods>();
    const { container } = render(
      <MDXEditor
        ref={editorRef}
        markdown={'- First\n- Second'}
        plugins={[
          listsPlugin(),
          richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }),
          selectEditorStartPlugin(),
        ]}
      />,
    );
    const editor = container.querySelector<HTMLElement>('[contenteditable="true"]')!;
    editor.focus();
    fireEvent.keyDown(editor, { ctrlKey: true, key: 'l' });

    await waitFor(() => expect(editorRef.current?.getMarkdown()).toContain('[ ] First'));
    expect(editorRef.current?.getMarkdown()).not.toContain('[ ] Second');
    expect(editorRef.current?.getMarkdown()).toContain('Second');
  });
});
