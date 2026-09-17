import { decodeNamedCharacterReference } from 'decode-named-character-reference';
import type {} from 'mdast-util-to-hast';
import type { Code, InlineCode, Link, Nodes, Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import type { Point } from 'unist';

const WIKILINK_PATTERN = /\[\[([^\]\n]+)\]\]/g;
const WIKILINK_HREF_PREFIX = '#wikilink=';
const SOURCE_START_ATTRIBUTE = 'data-markdown-source-start';
const SOURCE_END_ATTRIBUTE = 'data-markdown-source-end';
const BLOCK_START_ATTRIBUTE = 'data-markdown-block-source-start';

type MdastParent = Root | Extract<Nodes, { children: unknown }>;
type PositionedNode = Text | InlineCode | Code;

type CaretAtPoint = {
  node: Node;
  offset: number;
};

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

export type MarkdownClickPoint = {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
};

/** Convert source wikilinks to mdast links without losing their source positions. */
export function createRemarkWikilinkPlugin(source: string): Plugin<[], Root> {
  return () => (tree) => transformWikilinks(tree, source);
}

/** Equivalent to remark-breaks, but retains positions on the split text nodes. */
export function createRemarkSourceBreaksPlugin(source: string): Plugin<[], Root> {
  return () => (tree) => splitSoftBreaks(tree, source);
}

/** Mark visible source leaves with full-document offsets used by click-to-edit. */
export function createMarkdownSourcePositionPlugin(body: string, bodyStartOffset: number): Plugin<[], Root> {
  return () => (tree) => {
    visitNodes(tree, (node) => {
      if (node.type === 'text' && node.position) {
        setSourceProperties(node, bodyStartOffset + node.position.start.offset!, bodyStartOffset + node.position.end.offset!, true);
      } else if ((node.type === 'inlineCode' || node.type === 'code') && node.position) {
        const range = getCodeContentRange(node, body);
        setSourceProperties(node, bodyStartOffset + range.start, bodyStartOffset + range.end, false);
      }
    });
  };
}

/** Map a rendered-text UTF-16 boundary back to the corresponding Markdown source boundary. */
export function mapRenderedTextOffset(
  content: string,
  sourceStart: number,
  sourceEnd: number,
  renderedText: string,
  renderedOffset: number,
) {
  const start = clamp(sourceStart, 0, content.length);
  const end = clamp(sourceEnd, start, content.length);
  const target = clamp(renderedOffset, 0, renderedText.length);
  const source = content.slice(start, end);
  const boundaries = buildRenderedSourceBoundaries(source, renderedText);
  return start + (boundaries[target] ?? source.length);
}

/** Resolve a viewer click using native caret hit testing, with a block-start fallback. */
export function getMarkdownClickOffset(root: HTMLElement, point: MarkdownClickPoint, content: string): number | null {
  const target = point.target instanceof Element ? point.target : null;
  if (!target || !root.contains(target) || isInteractiveTarget(target)) return null;

  const selection = root.ownerDocument.defaultView?.getSelection();
  if (selection && !selection.isCollapsed) return null;

  const caret = getCaretAtPoint(root.ownerDocument as CaretDocument, point.clientX, point.clientY);
  if (!caret || !root.contains(caret.node)) return null;

  const sourceElement = getClosestElement(caret.node, `[${SOURCE_START_ATTRIBUTE}]`);
  if (sourceElement && target.closest(`[${SOURCE_START_ATTRIBUTE}]`) === sourceElement) {
    const sourceStart = Number(sourceElement.getAttribute(SOURCE_START_ATTRIBUTE));
    const sourceEnd = Number(sourceElement.getAttribute(SOURCE_END_ATTRIBUTE));
    if (Number.isFinite(sourceStart) && Number.isFinite(sourceEnd)) {
      const renderedOffset = getTextOffset(sourceElement, caret);
      if (renderedOffset !== null) {
        return mapRenderedTextOffset(content, sourceStart, sourceEnd, sourceElement.textContent ?? '', renderedOffset);
      }
    }
  }

  // Some generated constructs do not expose a positioned leaf. Only fall back
  // when the browser still hit actual text, never for empty block space.
  if (caret.node.nodeType === Node.TEXT_NODE && (caret.node.textContent ?? '').trim()) {
    const block = getClosestElement(caret.node, `[${BLOCK_START_ATTRIBUTE}]`);
    const blockStart = block ? Number(block.getAttribute(BLOCK_START_ATTRIBUTE)) : Number.NaN;
    return Number.isFinite(blockStart) ? blockStart : null;
  }

  return null;
}

function transformWikilinks(parent: MdastParent, source: string, insideLink = false) {
  const children = parent.children as Nodes[];
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];
    if (node.type === 'text' && !insideLink && node.position) {
      const replacements = splitWikilinkText(node, source);
      if (replacements) {
        children.splice(index, 1, ...replacements);
        index += replacements.length - 1;
      }
      continue;
    }

    if ('children' in node && Array.isArray(node.children)) {
      transformWikilinks(node as MdastParent, source, insideLink || node.type === 'link' || node.type === 'linkReference');
    }
  }
}

function splitWikilinkText(node: Text, source: string): Nodes[] | null {
  const replacements: Nodes[] = [];
  let sourceIndex = 0;
  let match: RegExpExecArray | null;
  WIKILINK_PATTERN.lastIndex = 0;

  while ((match = WIKILINK_PATTERN.exec(node.value))) {
    if (match.index > 0 && node.value[match.index - 1] === '!') continue;
    if (match.index > sourceIndex) replacements.push(createTextSlice(node, sourceIndex, match.index, source));

    const parsed = parseWikilink(match[1]);
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    const labelStart = matchStart + 2 + parsed.labelIndex;
    const labelEnd = labelStart + parsed.label.length;
    const link: Link = {
      type: 'link',
      url: `${WIKILINK_HREF_PREFIX}${encodeURIComponent(parsed.target)}`,
      children: [{
        type: 'text',
        value: parsed.label,
        position: slicePosition(node, labelStart, labelEnd, source),
      }],
      position: slicePosition(node, matchStart, matchEnd, source),
    };
    replacements.push(link);
    sourceIndex = matchEnd;
  }

  if (!replacements.length) return null;
  if (sourceIndex < node.value.length) replacements.push(createTextSlice(node, sourceIndex, node.value.length, source));
  return replacements;
}

function parseWikilink(rawLink: string) {
  const pipeIndex = rawLink.indexOf('|');
  const rawTarget = pipeIndex === -1 ? rawLink : rawLink.slice(0, pipeIndex);
  const target = rawTarget.trim();
  const headingIndex = target.indexOf('#');
  const targetWithoutHeading = headingIndex === -1 ? target : target.slice(0, headingIndex);
  const nextPipeIndex = pipeIndex === -1 ? -1 : rawLink.indexOf('|', pipeIndex + 1);
  const rawLabel = pipeIndex === -1
    ? null
    : rawLink.slice(pipeIndex + 1, nextPipeIndex === -1 ? undefined : nextPipeIndex);

  if (rawLabel !== null) {
    const label = rawLabel.trim();
    return { target: targetWithoutHeading, label, labelIndex: pipeIndex + 1 + rawLabel.indexOf(label) };
  }

  const slashIndex = targetWithoutHeading.lastIndexOf('/');
  const label = targetWithoutHeading.slice(slashIndex + 1) || targetWithoutHeading;
  return { target: targetWithoutHeading, label, labelIndex: rawLink.indexOf(label) };
}

function splitSoftBreaks(parent: MdastParent, source: string) {
  const children = parent.children as Nodes[];
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];
    if (node.type === 'text' && node.position && /\r?\n|\r/.test(node.value)) {
      const replacements: Nodes[] = [];
      const expression = /\r?\n|\r/g;
      let sourceIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = expression.exec(node.value))) {
        if (match.index > sourceIndex) replacements.push(createTextSlice(node, sourceIndex, match.index, source));
        replacements.push({ type: 'break', position: slicePosition(node, match.index, match.index + match[0].length, source) });
        sourceIndex = match.index + match[0].length;
      }
      if (sourceIndex < node.value.length) replacements.push(createTextSlice(node, sourceIndex, node.value.length, source));
      children.splice(index, 1, ...replacements);
      index += replacements.length - 1;
      continue;
    }
    if ('children' in node && Array.isArray(node.children)) splitSoftBreaks(node as MdastParent, source);
  }
}

function createTextSlice(node: Text, start: number, end: number, source: string): Text {
  return { type: 'text', value: node.value.slice(start, end), position: slicePosition(node, start, end, source) };
}

function slicePosition(node: Text, start: number, end: number, source: string) {
  const nodeStart = node.position!.start.offset!;
  const nodeEnd = node.position!.end.offset!;
  const sourceStart = mapRenderedTextOffset(source, nodeStart, nodeEnd, node.value, start);
  const sourceEnd = mapRenderedTextOffset(source, nodeStart, nodeEnd, node.value, end);
  return {
    start: advancePoint(node.position!.start, source.slice(nodeStart, sourceStart)),
    end: advancePoint(node.position!.start, source.slice(nodeStart, sourceEnd)),
  };
}

function advancePoint(start: Point, value: string): Point {
  let line = start.line;
  let column = start.column;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\n' || value[index] === '\r') {
      if (value[index] === '\r' && value[index + 1] === '\n') index += 1;
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column, offset: (start.offset ?? 0) + value.length };
}

function visitNodes(node: Nodes | Root, visitor: (node: PositionedNode) => void) {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') visitor(node);
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) visitNodes(child, visitor);
  }
}

function setSourceProperties(node: PositionedNode, start: number, end: number, wrapText: boolean) {
  node.data = {
    ...node.data,
    ...(wrapText ? { hName: 'span' } : {}),
    hProperties: {
      ...node.data?.hProperties,
      dataMarkdownSourceStart: start,
      dataMarkdownSourceEnd: end,
    },
  };
}

function getCodeContentRange(node: InlineCode | Code, body: string) {
  const start = node.position!.start.offset!;
  const end = node.position!.end.offset!;
  const raw = body.slice(start, end);
  if (node.type === 'inlineCode') {
    const opening = raw.match(/^`+/)?.[0].length ?? 0;
    const closing = raw.match(/`+$/)?.[0].length ?? 0;
    return { start: start + opening, end: Math.max(start + opening, end - closing) };
  }

  const openingFence = raw.match(/^ {0,3}(`{3,}|~{3,})[^\r\n]*(?:\r\n|\r|\n)/);
  if (!openingFence) return { start, end };
  const fenceCharacter = openingFence[1][0];
  const closingExpression = new RegExp(`(?:\\r\\n|\\r|\\n)( {0,3}\\${fenceCharacter}{3,}[ \\t]*)$`);
  const closingFence = raw.match(closingExpression);
  return {
    start: start + openingFence[0].length,
    end: closingFence?.index === undefined ? end : start + closingFence.index + getLeadingEolLength(closingFence[0]),
  };
}

function getLeadingEolLength(value: string) {
  return value.startsWith('\r\n') ? 2 : value.startsWith('\r') || value.startsWith('\n') ? 1 : 0;
}

function buildRenderedSourceBoundaries(source: string, rendered: string) {
  const boundaries = new Array<number>(rendered.length + 1);
  boundaries[0] = 0;
  let sourceIndex = 0;
  let renderedIndex = 0;

  while (renderedIndex < rendered.length) {
    const token = readSourceToken(source, sourceIndex);
    if (token && rendered.startsWith(token.value, renderedIndex)) {
      for (let index = 1; index <= token.value.length; index += 1) {
        boundaries[renderedIndex + index] = sourceIndex + Math.round((token.length * index) / token.value.length);
      }
      sourceIndex += token.length;
      renderedIndex += token.value.length;
      continue;
    }

    // Markdown constructs such as indented code can contain source-only
    // characters. Skip forward until the next rendered token is found.
    const next = findNextMatchingToken(source, sourceIndex + 1, rendered, renderedIndex);
    if (next !== null) {
      sourceIndex = next;
      continue;
    }

    renderedIndex += 1;
    boundaries[renderedIndex] = sourceIndex;
  }

  for (let index = 1; index < boundaries.length; index += 1) {
    if (boundaries[index] === undefined) boundaries[index] = boundaries[index - 1];
  }
  boundaries[rendered.length] = Math.min(source.length, Math.max(boundaries[rendered.length], sourceIndex));
  return boundaries;
}

function findNextMatchingToken(source: string, from: number, rendered: string, renderedIndex: number) {
  for (let index = from; index < source.length; index += 1) {
    const token = readSourceToken(source, index);
    if (token && rendered.startsWith(token.value, renderedIndex)) return index;
  }
  return null;
}

function readSourceToken(source: string, index: number): { value: string; length: number } | null {
  if (index >= source.length) return null;
  if (source[index] === '\\' && /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(source[index + 1] ?? '')) {
    return { value: source[index + 1], length: 2 };
  }
  if (source[index] === '&') {
    const entity = source.slice(index).match(/^&(#(?:x[\dA-Fa-f]+|\d+)|[A-Za-z][A-Za-z\d]+);/);
    if (entity) {
      const decoded = decodeNamedCharacterReference(entity[1]);
      if (decoded !== false) return { value: decoded, length: entity[0].length };
    }
  }
  if (source[index] === '\r' && source[index + 1] === '\n') return { value: '\n', length: 2 };
  return { value: source[index], length: 1 };
}

function getCaretAtPoint(document: CaretDocument, x: number, y: number): CaretAtPoint | null {
  const position = document.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function getTextOffset(element: Element, caret: CaretAtPoint) {
  try {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.setEnd(caret.node, caret.offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function getClosestElement(node: Node, selector: string) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest(selector) ?? null;
}

function isInteractiveTarget(target: Element) {
  return Boolean(target.closest('a, button, input, textarea, select, [role="button"], [role="menu"], [contenteditable="true"]'));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
