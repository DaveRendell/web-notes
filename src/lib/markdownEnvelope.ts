import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { readBackgroundComment } from './blockBackground';

export type MarkdownEnvelope = {
  frontmatterSource: string;
  bodySource: string;
  lineEnding: '\n' | '\r\n';
  hasFinalNewline: boolean;
};

export type RichMarkdownCompatibility =
  | { compatible: true; envelope: MarkdownEnvelope }
  | { compatible: false; envelope: MarkdownEnvelope; reason: string };

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const parser = unified().use(remarkParse).use(remarkGfm);

const SUPPORTED_NODE_TYPES = new Set([
  'root',
  'paragraph',
  'text',
  'heading',
  'emphasis',
  'strong',
  'delete',
  'inlineCode',
  'code',
  'blockquote',
  'thematicBreak',
  'break',
  'image',
  'link',
  'list',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
]);

export function splitMarkdownEnvelope(markdown: string): MarkdownEnvelope {
  const frontmatterSource = markdown.match(FRONTMATTER_PATTERN)?.[0] ?? '';
  const lineEnding = markdown.includes('\r\n') ? '\r\n' : '\n';

  return {
    frontmatterSource,
    bodySource: markdown.slice(frontmatterSource.length),
    lineEnding,
    hasFinalNewline: markdown.endsWith('\n'),
  };
}

export function joinMarkdownEnvelope(envelope: MarkdownEnvelope, body: string) {
  let normalizedBody = body.replace(/\r\n?|\n/g, envelope.lineEnding);

  if (envelope.hasFinalNewline) {
    normalizedBody = normalizedBody.replace(/(?:\r?\n)+$/, '') + envelope.lineEnding;
  } else {
    normalizedBody = normalizedBody.replace(/(?:\r?\n)+$/, '');
  }

  return envelope.frontmatterSource + normalizedBody;
}

export function checkRichMarkdownCompatibility(markdown: string): RichMarkdownCompatibility {
  const envelope = splitMarkdownEnvelope(markdown);

  try {
    const tree = parser.runSync(parser.parse(envelope.bodySource)) as Root;
    let unsupportedType: string | null = null;

    visit(tree, (node) => {
      if (node.type === 'html' && readBackgroundComment(node.value)) return;
      if (!SUPPORTED_NODE_TYPES.has(node.type)) unsupportedType ??= node.type;
    });

    if (unsupportedType) {
      return {
        compatible: false,
        envelope,
        reason: `This note contains unsupported ${unsupportedType} Markdown.`,
      };
    }

    return { compatible: true, envelope };
  } catch (error) {
    return {
      compatible: false,
      envelope,
      reason: error instanceof Error ? error.message : 'This note could not be parsed safely.',
    };
  }
}

export function areMarkdownBodiesSemanticallyEquivalent(left: string, right: string) {
  try {
    const leftTree = parser.runSync(parser.parse(left)) as Root;
    const rightTree = parser.runSync(parser.parse(right)) as Root;
    return JSON.stringify(normalizeEmptyListRuns(stripParserMetadata(leftTree)))
      === JSON.stringify(normalizeEmptyListRuns(stripParserMetadata(rightTree)));
  } catch {
    return false;
  }
}

// MDXEditor joins adjacent unordered lists even when differing source markers
// and blank lines made them separate MDAST lists. For non-empty lists that can
// affect intended grouping, so only fold list fragments made entirely of empty
// items into an adjacent unordered list. The item count is retained and
// therefore no user content is ignored.
function normalizeEmptyListRuns(value: unknown): unknown {
  if (Array.isArray(value)) {
    const children = value.map(normalizeEmptyListRuns);
    const result: unknown[] = [];
    for (const child of children) {
      const previous = result.at(-1);
      if (areCompatibleEmptyLists(previous, child)) {
        (previous as SemanticList).children.push(...(child as SemanticList).children);
      } else {
        result.push(child);
      }
    }
    return result;
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeEmptyListRuns(child)]));
}

type SemanticList = { type: 'list'; ordered: boolean; start: number | null; children: Array<{ type: 'listItem'; children: unknown[] }> };

function areCompatibleEmptyLists(left: unknown, right: unknown): left is SemanticList {
  if (!isList(left) || !isEmptyList(right)) return false;
  return !left.ordered && !right.ordered;
}

function isEmptyList(value: unknown): value is SemanticList {
  if (!isList(value)) return false;
  return value.children.length > 0
    && value.children.every((item) => item?.type === 'listItem' && Array.isArray(item.children) && item.children.length === 0);
}

function isList(value: unknown): value is SemanticList {
  if (!value || typeof value !== 'object') return false;
  const list = value as Partial<SemanticList>;
  return list.type === 'list'
    && Array.isArray(list.children)
    && list.children.every((item) => item?.type === 'listItem' && Array.isArray(item.children));
}

function stripParserMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripParserMetadata);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'position' && key !== 'data')
      .map(([key, child]) => [key, stripParserMetadata(child)]),
  );
}
