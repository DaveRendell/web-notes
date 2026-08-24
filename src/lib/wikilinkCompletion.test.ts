import {
  autocompletion,
  acceptCompletion,
  closeCompletion,
  CompletionContext,
  completionStatus,
  moveCompletionSelection,
  selectedCompletionIndex,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { VaultNode } from '../types/vault';
import { createWikilinkCompletionSource } from './wikilinkCompletion';

const alpha = note('alpha', 'Alpha.md', 'Projects/Alpha.md');
const beta = note('beta', 'Beta.md', 'Beta.md');
const duplicate = note('duplicate', 'Alpha.md', 'Archive/Alpha.md');
const source = createWikilinkCompletionSource([alpha, beta, duplicate], [beta, alpha]);
let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

describe('wikilink completion', () => {
  it('shows recent notes after the opening brackets', async () => {
    const result = await complete('See [[');

    expect(result?.from).toBe(6);
    expect(result?.options.map((option) => option.label)).toEqual(['Beta', 'Alpha']);
  });

  it('searches titles and paths while preserving duplicate-note paths', async () => {
    const titleResult = await complete('[[alp');
    const pathResult = await complete('[[archive');

    expect(titleResult?.options.map((option) => option.detail)).toEqual([
      'Archive/Alpha.md',
      'Projects/Alpha.md',
    ]);
    expect(pathResult?.options.map((option) => option.detail)).toEqual(['Archive/Alpha.md']);
  });

  it.each([
    ['an ordinary Markdown link', '[alp'],
    ['an embedded wikilink', '![[alp'],
    ['a completed wikilink', '[[alp]]'],
    ['a wikilink alias', '[[alp|label'],
    ['a wikilink heading', '[[alp#heading'],
    ['frontmatter', '---\nlink: [[alp\n---\nBody', 13],
    ['inline code', '`[[alp`', 6],
    ['fenced code', '```\n[[alp\n```', 9],
  ])('does not offer suggestions for %s', async (_label, document, position?: number) => {
    expect(await complete(document, position)).toBeNull();
  });

  it('inserts a full extension-free path and replaces existing closing brackets', async () => {
    const state = createState('See [[alp]] next');
    const position = 'See [[alp'.length;
    const result = await source(new CompletionContext(state, position, false)) as CompletionResult;
    const completion = result.options.find((option) => option.detail === 'Projects/Alpha.md');
    view = new EditorView({ parent: document.body, state });

    expect(typeof completion?.apply).toBe('function');
    if (typeof completion?.apply === 'function') {
      completion.apply(view, completion, result.from, result.to ?? position);
    }

    expect(view.state.doc.toString()).toBe('See [[Projects/Alpha]] next');
    expect(view.state.selection.main.head).toBe('See [[Projects/Alpha]]'.length);
  });

  it('adds closing brackets when none are present', async () => {
    const state = createState('[[bet');
    const result = await source(new CompletionContext(state, state.doc.length, false)) as CompletionResult;
    const completion = result.options[0];
    view = new EditorView({ parent: document.body, state });

    if (typeof completion.apply === 'function') {
      completion.apply(view, completion, result.from, result.to ?? state.doc.length);
    }

    expect(view.state.doc.toString()).toBe('[[Beta]]');
  });

  it('supports keyboard navigation, acceptance, and dismissal', async () => {
    view = createAutocompleteView();
    typeText(view, '[[');
    await waitFor(() => expect(completionStatus(view!.state)).toBe('active'));
    await waitFor(() => expect(selectedCompletionIndex(view!.state)).toBe(0));

    moveCompletionSelection(true)(view);
    await waitFor(() => expect(selectedCompletionIndex(view!.state)).toBe(1));
    acceptCompletion(view);
    expect(view.state.doc.toString()).toBe('[[Projects/Alpha]]');

    typeText(view, ' [[');
    await waitFor(() => expect(completionStatus(view!.state)).toBe('active'));
    closeCompletion(view);
    expect(completionStatus(view.state)).toBeNull();
  });

  it('accepts a suggestion with the mouse', async () => {
    view = createAutocompleteView();
    typeText(view, '[[bet');
    await waitFor(() => expect(completionStatus(view!.state)).toBe('active'));

    const option = document.querySelector<HTMLElement>('.cm-tooltip-autocomplete li[role="option"]');
    expect(option?.textContent).toContain('Beta');
    fireEvent.mouseDown(option!);

    expect(view.state.doc.toString()).toBe('[[Beta]]');
  });
});

async function complete(document: string, position = document.length) {
  return source(new CompletionContext(createState(document), position, false));
}

function createState(document: string) {
  return EditorState.create({ doc: document, extensions: [markdown()] });
}

function createAutocompleteView() {
  const state = EditorState.create({
    extensions: [markdown(), autocompletion({ interactionDelay: 0, override: [source] })],
  });
  const editorView = new EditorView({ parent: document.body, state });
  editorView.focus();
  return editorView;
}

function typeText(editorView: EditorView, text: string) {
  const position = editorView.state.selection.main.head;
  editorView.dispatch({
    changes: { from: position, insert: text },
    selection: { anchor: position + text.length },
    userEvent: 'input.type',
  });
}

function note(id: string, name: string, path: string): VaultNode {
  return {
    id,
    mimeType: 'text/markdown',
    name,
    path,
    source: { id, mimeType: 'text/markdown', name },
    type: 'markdown',
  };
}
