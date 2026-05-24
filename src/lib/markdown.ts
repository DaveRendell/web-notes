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
