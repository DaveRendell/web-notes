import type { CompletionContext } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const EXCLUDED_SYNTAX_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock']);

export function isProseCompletionContext(context: CompletionContext) {
  const frontmatter = context.state.sliceDoc().match(FRONTMATTER_PATTERN);
  if (frontmatter && context.pos <= frontmatter[0].length) return false;

  const resolvedNode = syntaxTree(context.state).resolveInner(context.pos, -1);
  for (let node: typeof resolvedNode | null = resolvedNode; node; node = node.parent) {
    if (EXCLUDED_SYNTAX_NODES.has(node.name)) return false;
  }

  return true;
}
