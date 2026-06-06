import type { ListItem, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { parse } from 'yaml';

export type FrontmatterProperty = {
  key: string;
  value: string;
};

export type ParsedMarkdown = {
  body: string;
  frontmatter: FrontmatterProperty[];
  frontmatterError: string | null;
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const WIKILINK_PATTERN = /!?\[\[([^\]\n]+)\]\]/g;
const WIKILINK_HREF_PREFIX = '#wikilink=';
const TASK_MARKER_PATTERN = /^(\s*(?:[-*+]|\d+[.)])\s+\[)( |x|X)(\])/;
const markdownParser = unified().use(remarkParse).use(remarkGfm);

export type MarkdownTaskCheckbox = {
  checked: boolean;
  line: number;
  markerOffset: number;
  sourcePreview: string;
};

export function parseMarkdownWithFrontmatter(content: string): ParsedMarkdown {
  const match = content.match(FRONTMATTER_PATTERN);

  if (!match) {
    return {
      body: content,
      frontmatter: [],
      frontmatterError: null,
    };
  }

  const [, rawFrontmatter] = match;
  const body = content.slice(match[0].length);

  try {
    const parsed = parse(rawFrontmatter);

    if (!isRecord(parsed)) {
      return {
        body,
        frontmatter: [],
        frontmatterError: null,
      };
    }

    return {
      body,
      frontmatter: Object.entries(parsed).map(([key, value]) => ({
        key,
        value: formatFrontmatterValue(value),
      })),
      frontmatterError: null,
    };
  } catch (error) {
    return {
      body,
      frontmatter: [],
      frontmatterError: error instanceof Error ? error.message : 'Could not parse frontmatter.',
    };
  }
}

export function convertWikilinksToMarkdown(content: string) {
  return content.replace(WIKILINK_PATTERN, (fullMatch, rawLink: string) => {
    if (fullMatch.startsWith('!')) {
      return fullMatch;
    }

    const { label, target } = parseWikilink(rawLink);
    return `[${escapeMarkdownLinkText(label)}](${WIKILINK_HREF_PREFIX}${encodeURIComponent(target)})`;
  });
}

export function getWikilinkTargetFromHref(href: string) {
  if (!href.startsWith(WIKILINK_HREF_PREFIX)) {
    return null;
  }

  return decodeURIComponent(href.slice(WIKILINK_HREF_PREFIX.length));
}

export function findMarkdownTaskCheckboxes(content: string): MarkdownTaskCheckbox[] {
  const bodyStart = getFrontmatterEndOffset(content);
  const body = content.slice(bodyStart);
  const tree = markdownParser.runSync(markdownParser.parse(body)) as Root;
  const checkboxes: MarkdownTaskCheckbox[] = [];

  visit(tree, 'listItem', (node: ListItem) => {
    if (typeof node.checked !== 'boolean' || node.position?.start.offset === undefined) {
      return;
    }

    const markerOffset = findTaskMarkerOffset(body, node.position.start.offset);

    if (markerOffset === null) {
      return;
    }

    checkboxes.push({
      checked: node.checked,
      line: node.position.start.line + getLineNumberAtOffset(content, bodyStart) - 1,
      markerOffset: bodyStart + markerOffset,
      sourcePreview: getLinePreview(body, markerOffset),
    });
  });

  return checkboxes;
}

export function toggleMarkdownTaskCheckbox(content: string, markerOffset: number, checked: boolean) {
  if (!isTaskMarkerAtOffset(content, markerOffset)) {
    return content;
  }

  return `${content.slice(0, markerOffset)}${checked ? 'x' : ' '}${content.slice(markerOffset + 1)}`;
}

function parseWikilink(rawLink: string) {
  const [rawTarget, rawLabel] = rawLink.split('|');
  const target = rawTarget.trim();
  const headingIndex = target.indexOf('#');
  const targetWithoutHeading = headingIndex === -1 ? target : target.slice(0, headingIndex);

  return {
    target: targetWithoutHeading,
    label: (rawLabel ?? getDefaultWikilinkLabel(targetWithoutHeading)).trim(),
  };
}

function getFrontmatterEndOffset(content: string) {
  const match = content.match(FRONTMATTER_PATTERN);
  return match ? match[0].length : 0;
}

function getLineNumberAtOffset(content: string, offset: number) {
  return content.slice(0, offset).split('\n').length;
}

function getLinePreview(content: string, offset: number) {
  const lineStart = content.lastIndexOf('\n', offset) + 1;
  const lineEnd = content.indexOf('\n', offset);
  return content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim().slice(0, 140);
}

function findTaskMarkerOffset(content: string, nodeStartOffset: number) {
  const lineEndIndex = content.indexOf('\n', nodeStartOffset);
  const line = content.slice(nodeStartOffset, lineEndIndex === -1 ? undefined : lineEndIndex);
  const match = line.match(TASK_MARKER_PATTERN);

  if (!match) {
    return null;
  }

  return nodeStartOffset + match[1].length;
}

function isTaskMarkerAtOffset(content: string, markerOffset: number) {
  const marker = content[markerOffset];
  return marker === ' ' || marker === 'x' || marker === 'X';
}

function getDefaultWikilinkLabel(target: string) {
  const pathParts = target.split('/');
  return pathParts[pathParts.length - 1] || target;
}

function escapeMarkdownLinkText(text: string) {
  return text.replace(/([\\[\]])/g, '\\$1');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatFrontmatterValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatFrontmatterValue(item)).join(', ');
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
