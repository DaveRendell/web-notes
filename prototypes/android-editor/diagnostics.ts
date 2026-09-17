import { areMarkdownBodiesSemanticallyEquivalent } from '../../src/lib/markdownEnvelope';

export type MarkdownComparison = {
  exactMatch: boolean;
  semanticMatch: boolean;
  firstDifferentLine: number | null;
};

export type EditorEvent = {
  kind: 'ready' | 'normalization' | 'user-change' | 'snapshot' | 'error';
  session: number;
  fixture: string;
  revision: number;
  characters: number;
  elapsedMs: number;
  comparison?: MarkdownComparison;
  message?: string;
};

export type WriteAttempt = {
  session: number;
  fixture: string;
  revision: number;
  characters: number;
};

export type EditorFocusEvent = { session: number; focused: boolean };

export function firstDifferentLine(left: string, right: string): number | null {
  if (left === right) return null;
  const leftLines = left.split(/\r?\n/);
  const rightLines = right.split(/\r?\n/);
  for (let index = 0; index < Math.max(leftLines.length, rightLines.length); index += 1) {
    if (leftLines[index] !== rightLines[index]) return index + 1;
  }
  // The only difference is line-ending style.
  return 1;
}

export function compareMarkdown(source: string, rendered: string): MarkdownComparison {
  return {
    exactMatch: source === rendered,
    semanticMatch: areMarkdownBodiesSemanticallyEquivalent(source, rendered),
    firstDifferentLine: firstDifferentLine(source, rendered),
  };
}
