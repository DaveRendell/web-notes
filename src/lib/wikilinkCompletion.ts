import {
  CompletionContext,
  type Completion,
  type CompletionSource,
  pickedCompletion,
} from '@codemirror/autocomplete';
import { isProseCompletionContext } from './markdownCompletion';
import { getNoteTitle, searchNotes } from './noteSearch';
import type { VaultNode } from '../types/vault';

const MAX_RESULTS = 8;

export function createWikilinkCompletionSource(
  notes: VaultNode[],
  recentNotes: VaultNode[],
): CompletionSource {
  return (context: CompletionContext) => {
    const match = context.matchBefore(/\[\[([^\]\n|#]*)$/);
    if (!match || context.state.sliceDoc(match.from - 1, match.from) === '!') return null;
    if (!isProseCompletionContext(context)) return null;

    const query = match.text.slice(2);
    const results = query.trim()
      ? searchNotes(notes, query, MAX_RESULTS)
      : recentNotes.slice(0, MAX_RESULTS);

    if (results.length === 0) return null;

    return {
      filter: false,
      from: match.from + 2,
      options: results.map(createCompletion),
      to: context.pos,
    };
  };
}

function createCompletion(note: VaultNode): Completion {
  const target = note.path.replace(/\.md$/i, '');

  return {
    apply(view, completion, from, to) {
      const closingBrackets = view.state.sliceDoc(to, to + 2).match(/^\]{1,2}/)?.[0].length ?? 0;
      const insert = `${target}]]`;

      view.dispatch({
        annotations: pickedCompletion.of(completion),
        changes: { from, insert, to: to + closingBrackets },
        selection: { anchor: from + insert.length },
        userEvent: 'input.complete',
      });
    },
    detail: note.path,
    label: getNoteTitle(note),
    type: 'text',
  };
}
