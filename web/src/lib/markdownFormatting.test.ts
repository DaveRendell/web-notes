import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import {
  insertMarkdownLink,
  type MarkdownFormat,
  toggleChecklist,
  toggleMarkdownFormat,
  toggleMarkdownList,
} from './markdownFormatting';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

describe('Markdown formatting', () => {
  it.each([
    ['bold', '**hello**'],
    ['italic', '_hello_'],
    ['strikethrough', '~~hello~~'],
  ] satisfies Array<[MarkdownFormat, string]>)('wraps and unwraps a selection with %s markup', (format, wrapped) => {
    view = createView('hello', 0, 5);

    toggleMarkdownFormat(view, format);
    expect(view.state.doc.toString()).toBe(wrapped);
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('hello');

    toggleMarkdownFormat(view, format);
    expect(view.state.doc.toString()).toBe('hello');
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('hello');
  });

  it('inserts paired markers at the cursor and places the cursor between them', () => {
    view = createView('hello', 2);

    toggleMarkdownFormat(view, 'bold');

    expect(view.state.doc.toString()).toBe('he****llo');
    expect(view.state.selection.main.head).toBe(4);
  });

  it('allows formats to be stacked around the same selection', () => {
    view = createView('hello', 0, 5);

    toggleMarkdownFormat(view, 'bold');
    toggleMarkdownFormat(view, 'italic');

    expect(view.state.doc.toString()).toBe('**_hello_**');
  });

  it('creates a checklist and then toggles its checked state', () => {
    view = createView('todo', 2);

    toggleChecklist(view);
    expect(view.state.doc.toString()).toBe('- [ ] todo');

    toggleChecklist(view);
    expect(view.state.doc.toString()).toBe('- [x] todo');

    toggleChecklist(view);
    expect(view.state.doc.toString()).toBe('- [ ] todo');
  });

  it('converts an existing list marker when creating a checklist', () => {
    view = createView('  1. todo', 9);

    toggleChecklist(view);

    expect(view.state.doc.toString()).toBe('  - [ ] todo');
  });

  it('creates, numbers, and removes list markers across selected lines', () => {
    view = createView('one\ntwo', 0, 7);

    toggleMarkdownList(view, 'ordered');
    expect(view.state.doc.toString()).toBe('1. one\n2. two');

    toggleMarkdownList(view, 'ordered');
    expect(view.state.doc.toString()).toBe('one\ntwo');

    toggleMarkdownList(view, 'unordered');
    expect(view.state.doc.toString()).toBe('- one\n- two');
  });

  it('inserts a Markdown link and selects the URL placeholder', () => {
    view = createView('visit OpenAI today', 6, 12);

    insertMarkdownLink(view);

    expect(view.state.doc.toString()).toBe('visit [OpenAI](url) today');
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('url');
  });

  it('inserts a Markdown link label placeholder without a selection', () => {
    view = createView('visit ', 6);

    insertMarkdownLink(view);

    expect(view.state.doc.toString()).toBe('visit [text](url)');
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('text');
  });
});

function createView(document: string, anchor: number, head = anchor) {
  const state = EditorState.create({
    doc: document,
    selection: { anchor, head },
  });
  return new EditorView({ parent: window.document.body, state });
}
