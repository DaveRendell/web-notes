import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmojiCompletionSource } from './emojiCompletion';

const source = createEmojiCompletionSource();
let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

describe('emoji completion', () => {
  it('suggests emoji by primary name and related keywords', async () => {
    const exactResult = await complete('Launch :rocket');
    const keywordResult = await complete('Drink :coffee');

    expect(exactResult?.options[0]).toEqual(expect.objectContaining({
      displayLabel: '🚀 :rocket:',
      label: 'rocket',
    }));
    expect(keywordResult?.options.some((option) => option.displayLabel?.startsWith('☕ '))).toBe(true);
    expect(keywordResult?.options.length).toBeLessThanOrEqual(8);
  });

  it('only starts after a colon immediately followed by a word', async () => {
    expect(await complete('Meeting:')).toBeNull();
    expect(await complete('Meeting: notes')).toBeNull();
    expect(await complete('Ratio:2')).toBeNull();
    expect(await complete('Meeting:rocket')).not.toBeNull();
  });

  it.each([
    ['frontmatter', '---\nicon: rocket\n---\nBody', 16],
    ['inline code', '`:rocket`', 8],
    ['fenced code', '```\n:rocket\n```', 11],
  ])('does not offer suggestions in %s', async (_label, document, position) => {
    expect(await complete(document, position)).toBeNull();
  });

  it('replaces the shortcode and consumes an existing closing colon', async () => {
    const state = createState('Launch :rocket: now');
    const position = 'Launch :rocket'.length;
    const result = await source(new CompletionContext(state, position, false)) as CompletionResult;
    const completion = result.options.find((option) => option.label === 'rocket');
    view = new EditorView({ parent: document.body, state });

    expect(typeof completion?.apply).toBe('function');
    if (typeof completion?.apply === 'function') {
      completion.apply(view, completion, result.from, result.to ?? position);
    }

    expect(view.state.doc.toString()).toBe('Launch 🚀 now');
    expect(view.state.selection.main.head).toBe('Launch 🚀'.length);
  });
});

async function complete(document: string, position = document.length) {
  return source(new CompletionContext(createState(document), position, false));
}

function createState(document: string) {
  return EditorState.create({ doc: document, extensions: [markdown()] });
}
