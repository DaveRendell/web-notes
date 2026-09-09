import {
  type Completion,
  type CompletionContext,
  type CompletionSource,
  pickedCompletion,
} from '@codemirror/autocomplete';
import emojiKeywords from 'emojilib';
import { isProseCompletionContext } from './markdownCompletion';

const MAX_RESULTS = 8;

export type EmojiSearchEntry = {
  emoji: string;
  keywords: string[];
  name: string;
};

const emojiSearchEntries: EmojiSearchEntry[] = Object.entries(emojiKeywords).map(([emoji, keywords]) => ({
  emoji,
  keywords: keywords.map(normalizeKeyword),
  name: normalizeKeyword(keywords[0] ?? ''),
}));

export function createEmojiCompletionSource(): CompletionSource {
  return (context: CompletionContext) => {
    const match = context.matchBefore(/:[A-Za-z][A-Za-z0-9_+-]*$/);
    if (!match || !isProseCompletionContext(context)) return null;

    const query = normalizeKeyword(match.text.slice(1));
    const results = searchEmoji(query);
    if (results.length === 0) return null;

    return {
      filter: false,
      from: match.from,
      options: results.map(createCompletion),
      to: context.pos,
    };
  };
}

export function searchEmoji(query: string, limit = MAX_RESULTS) {
  const normalizedQuery = normalizeKeyword(query);
  return emojiSearchEntries
    .map((entry) => ({ entry, score: getSearchScore(entry, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map((result) => result.entry);
}

function getSearchScore(entry: EmojiSearchEntry, query: string) {
  if (entry.name === query) return 100;
  if (entry.name.startsWith(query)) return 80;
  if (entry.keywords.includes(query)) return 70;
  if (entry.keywords.some((keyword) => keyword.startsWith(query))) return 60;
  if (entry.keywords.some((keyword) => keyword.includes(query))) return 30;
  return 0;
}

function createCompletion(entry: EmojiSearchEntry): Completion {
  return {
    apply(view, completion, from, to) {
      const closingColon = view.state.sliceDoc(to, to + 1) === ':' ? 1 : 0;
      view.dispatch({
        annotations: pickedCompletion.of(completion),
        changes: { from, insert: entry.emoji, to: to + closingColon },
        selection: { anchor: from + entry.emoji.length },
        userEvent: 'input.complete',
      });
    },
    displayLabel: `${entry.emoji} :${entry.name}:`,
    label: entry.name,
    type: 'emoji',
  };
}

function normalizeKeyword(keyword: string) {
  return keyword.toLowerCase().replace(/[\s-]+/g, '_');
}
