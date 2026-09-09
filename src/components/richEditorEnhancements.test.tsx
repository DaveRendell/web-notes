import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef, useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MDXEditor,
  type MDXEditorMethods,
  addComposerChild$,
  linkPlugin,
  listsPlugin,
  realmPlugin,
} from '@mdxeditor/editor';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import {
  emojiTrigger,
  richEditorEnhancementsPlugin,
  wikiLinkTrigger,
} from './richEditorEnhancements';

afterEach(cleanup);

function SelectEditorStart() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.update(() => $getRoot().selectStart()), [editor]);
  return null;
}

const selectEditorStartPlugin = realmPlugin({
  init(realm) {
    realm.pub(addComposerChild$, SelectEditorStart);
  },
});

describe('rich editor enhancements', () => {
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
