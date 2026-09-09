import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

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
    return JSON.stringify(stripParserMetadata(leftTree)) === JSON.stringify(stripParserMetadata(rightTree));
  } catch {
    return false;
  }
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
