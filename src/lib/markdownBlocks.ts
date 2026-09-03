import type { List, ListItem, Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const parser = unified().use(remarkParse).use(remarkGfm);

export type MarkdownBlockPlacement = 'before' | 'after' | 'nest' | 'outdent';

export type MarkdownBlockMove = {
  sourceId: string;
  targetId?: string;
  placement: MarkdownBlockPlacement;
};

export type MarkdownListStyle = {
  ordered: boolean;
  marker: string;
};

export type MarkdownBlock = {
  id: string;
  kind: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  indent: number;
  parentId: string | null;
  childIds: string[];
  listId: string | null;
  listStyle: MarkdownListStyle | null;
  isListItem: boolean;
};

export type MarkdownListContainer = {
  id: string;
  ownerId: string | null;
  startLine: number;
  endLine: number;
  indent: number;
  style: MarkdownListStyle;
};

export type MarkdownBlockDocument = {
  content: string;
  blocks: MarkdownBlock[];
  lists: MarkdownListContainer[];
  bodyStartOffset: number;
};

export type MarkdownBlockMoveResult = {
  content: string;
  changed: boolean;
};

type Line = { text: string; eol: string };

export function parseMarkdownBlocks(content: string): MarkdownBlockDocument {
  const frontmatter = content.match(FRONTMATTER_PATTERN)?.[0] ?? '';
  const bodyStartOffset = frontmatter.length;
  const body = content.slice(bodyStartOffset);
  const tree = parser.runSync(parser.parse(body)) as Root;
  const blocks: MarkdownBlock[] = [];
  const lists: MarkdownListContainer[] = [];

  function addContainerChildren(parent: Root | ListItem, ownerId: string | null, path: string) {
    let skippedLead = false;

    parent.children.forEach((node, index) => {
      const nodePath = `${path}.${index}`;

      if (node.type === 'list') {
        addList(node, ownerId, nodePath);
        return;
      }

      // The first non-list child is the visible body of a list item and uses the
      // list item's handle. Later children are independently movable content.
      if (parent.type === 'listItem' && !skippedLead) {
        skippedLead = true;
        return;
      }

      addBlock(node, ownerId, nodePath);
    });
  }

  function addList(list: List, ownerId: string | null, path: string) {
    if (!list.position) return;
    const style = getListStyle(list, body);
    const listId = `list:${path}:${list.position.start.offset ?? 0}`;
    lists.push({
      id: listId,
      ownerId,
      startLine: list.position.start.line + getLineOffset(content, bodyStartOffset) - 1,
      endLine: list.position.end.line + getLineOffset(content, bodyStartOffset) - 1,
      indent: Math.max(0, list.position.start.column - 1),
      style,
    });

    list.children.forEach((item, index) => addListItem(item, ownerId, listId, style, `${path}.i${index}`));
  }

  function addListItem(item: ListItem, ownerId: string | null, listId: string, style: MarkdownListStyle, path: string) {
    if (!item.position) return;
    const id = `block:${path}:${item.position.start.offset ?? 0}`;
    const block = createBlock(item, id, ownerId, listId, style, bodyStartOffset, content);
    blocks.push(block);
    addContainerChildren(item, id, path);
  }

  function addBlock(node: Nodes, parentId: string | null, path: string) {
    if (!node.position || node.type === 'definition' || node.type === 'yaml') return;
    const id = `block:${path}:${node.position.start.offset ?? 0}`;
    blocks.push(createBlock(node, id, parentId, null, null, bodyStartOffset, content));
  }

  addContainerChildren(tree, null, 'root');

  const childIds = new Map<string, string[]>();
  for (const block of blocks) {
    if (!block.parentId) continue;
    const children = childIds.get(block.parentId) ?? [];
    children.push(block.id);
    childIds.set(block.parentId, children);
  }

  return {
    content,
    blocks: blocks.map((block) => ({ ...block, childIds: childIds.get(block.id) ?? [] })),
    lists,
    bodyStartOffset,
  };
}

export function moveMarkdownBlock(
  document: MarkdownBlockDocument,
  move: MarkdownBlockMove,
): MarkdownBlockMoveResult {
  const source = findBlock(document, move.sourceId);
  const target = move.targetId ? findBlock(document, move.targetId) : null;
  if (!source || !canMoveMarkdownBlock(document, move)) return unchanged(document);

  const destination = resolveDestination(document, source, target, move.placement);
  if (!destination) return unchanged(document);

  const lines = splitLines(document.content);
  const sourceStart = source.startLine - 1;
  const sourceEnd = source.endLine;
  const movedLines = lines.slice(sourceStart, sourceEnd);
  if (!movedLines.length) return unchanged(document);

  const transformed = reindentLines(movedLines, source.indent, destination.indent);
  if (source.isListItem && destination.listStyle) {
    transformed[0] = {
      ...transformed[0],
      text: replaceListMarker(transformed[0].text, destination.indent, destination.listStyle),
    };
  }

  lines.splice(sourceStart, sourceEnd - sourceStart);
  let insertionLine = destination.line;
  if (sourceStart < insertionLine) insertionLine -= sourceEnd - sourceStart;
  insertionLine = cleanRemovalBoundary(lines, sourceStart, insertionLine);
  insertionLine = Math.max(0, Math.min(lines.length, insertionLine));

  const before = lines[insertionLine - 1];
  const after = lines[insertionLine];
  const compactListInsertion = destination.compact;
  const inserted = [...transformed];
  const fallbackEol = detectEol(document.content);

  ensureTrailingEol(inserted, fallbackEol, Boolean(after));
  if (!compactListInsertion) {
    if (before && before.text.trim() !== '') inserted.unshift({ text: '', eol: fallbackEol });
    if (after && after.text.trim() !== '') inserted.push({ text: '', eol: fallbackEol });
  }

  lines.splice(insertionLine, 0, ...inserted);
  const content = joinLines(lines);
  if (content === document.content) return unchanged(document);

  // A malformed transformation must never reach the cache or Drive.
  try {
    parser.runSync(parser.parse(content.slice(document.bodyStartOffset)));
  } catch {
    return unchanged(document);
  }

  return { content, changed: true };
}

export function deleteMarkdownBlock(document: MarkdownBlockDocument, blockId: string): MarkdownBlockMoveResult {
  const block = findBlock(document, blockId);
  if (!block) return unchanged(document);

  const lines = splitLines(document.content);
  const startLine = block.startLine - 1;
  lines.splice(startLine, block.endLine - startLine);
  cleanRemovalBoundary(lines, startLine, lines.length);
  const content = joinLines(lines);

  try {
    parser.runSync(parser.parse(content.slice(document.bodyStartOffset)));
  } catch {
    return unchanged(document);
  }

  return { content, changed: content !== document.content };
}

export function canMoveMarkdownBlock(document: MarkdownBlockDocument, move: MarkdownBlockMove) {
  const source = findBlock(document, move.sourceId);
  const target = move.targetId ? findBlock(document, move.targetId) : null;
  if (!source) return false;
  if (move.placement !== 'outdent' && !target) return false;
  if (target && (target.id === source.id || isDescendant(document, target.id, source.id))) return false;
  if (move.placement === 'outdent') return source.parentId !== null;
  if (!target) return false;
  if (move.placement === 'nest') return target.isListItem && source.parentId !== target.id;

  const siblings = document.blocks
    .filter((block) => block.parentId === source.parentId)
    .sort((a, b) => a.startOffset - b.startOffset);
  const sourceIndex = siblings.findIndex((block) => block.id === source.id);
  const targetIndex = siblings.findIndex((block) => block.id === target.id);
  if (sourceIndex !== -1 && targetIndex !== -1) {
    if (move.placement === 'before' && sourceIndex + 1 === targetIndex) return false;
    if (move.placement === 'after' && sourceIndex - 1 === targetIndex) return false;
  }
  return true;
}

export function getMarkdownBlockActions(document: MarkdownBlockDocument, blockId: string) {
  const block = findBlock(document, blockId);
  if (!block) return { canMoveUp: false, canMoveDown: false, canIndent: false, canOutdent: false };
  const siblings = document.blocks
    .filter((candidate) => candidate.parentId === block.parentId)
    .sort((a, b) => a.startOffset - b.startOffset);
  const index = siblings.findIndex((candidate) => candidate.id === block.id);
  return {
    canMoveUp: index > 0,
    canMoveDown: index >= 0 && index < siblings.length - 1,
    canIndent: index > 0 && siblings[index - 1].isListItem,
    canOutdent: block.parentId !== null,
  };
}

export function getMarkdownBlockMenuMove(
  document: MarkdownBlockDocument,
  blockId: string,
  action: 'up' | 'down' | 'indent' | 'outdent',
): MarkdownBlockMove | null {
  const block = findBlock(document, blockId);
  if (!block) return null;
  if (action === 'outdent') return block.parentId ? { sourceId: blockId, placement: 'outdent' } : null;

  const siblings = document.blocks
    .filter((candidate) => candidate.parentId === block.parentId)
    .sort((a, b) => a.startOffset - b.startOffset);
  const index = siblings.findIndex((candidate) => candidate.id === blockId);
  if (action === 'up' && index > 0) return { sourceId: blockId, targetId: siblings[index - 1].id, placement: 'before' };
  if (action === 'down' && index >= 0 && index < siblings.length - 1) {
    return { sourceId: blockId, targetId: siblings[index + 1].id, placement: 'after' };
  }
  if (action === 'indent' && index > 0 && siblings[index - 1].isListItem) {
    return { sourceId: blockId, targetId: siblings[index - 1].id, placement: 'nest' };
  }
  return null;
}

export function isMarkdownBlockDescendant(document: MarkdownBlockDocument, candidateId: string, ancestorId: string) {
  return isDescendant(document, candidateId, ancestorId);
}

function createBlock(
  node: Nodes,
  id: string,
  parentId: string | null,
  listId: string | null,
  listStyle: MarkdownListStyle | null,
  bodyStartOffset: number,
  content: string,
): MarkdownBlock {
  const position = node.position!;
  const lineOffset = getLineOffset(content, bodyStartOffset);
  return {
    id,
    kind: node.type,
    startOffset: bodyStartOffset + (position.start.offset ?? 0),
    endOffset: bodyStartOffset + (position.end.offset ?? 0),
    startLine: position.start.line + lineOffset - 1,
    endLine: position.end.line + lineOffset - 1,
    indent: Math.max(0, position.start.column - 1),
    parentId,
    childIds: [],
    listId,
    listStyle,
    isListItem: node.type === 'listItem',
  };
}

function resolveDestination(
  document: MarkdownBlockDocument,
  source: MarkdownBlock,
  target: MarkdownBlock | null,
  placement: MarkdownBlockPlacement,
): { line: number; indent: number; listStyle: MarkdownListStyle | null; compact: boolean } | null {
  if (placement === 'outdent') {
    if (!source.parentId) return null;
    const parent = findBlock(document, source.parentId);
    if (!parent) return null;
    const parentList = parent.listId ? document.lists.find((list) => list.id === parent.listId) : null;
    return {
      line: source.isListItem ? parent.endLine : (parentList?.endLine ?? parent.endLine),
      indent: parent.indent,
      listStyle: source.isListItem ? parent.listStyle : null,
      compact: source.isListItem,
    };
  }

  if (!target) return null;
  if (placement === 'nest') {
    if (!target.isListItem) return null;
    const childLists = document.lists.filter((list) => list.ownerId === target.id);
    const childList = childLists.at(-1);
    const contentIndent = getListItemContentIndent(document.content, target);
    return {
      line: target.endLine,
      indent: childList?.indent ?? contentIndent,
      listStyle: source.isListItem ? (childList?.style ?? source.listStyle) : null,
      compact: source.isListItem,
    };
  }

  if (!source.isListItem && target.isListItem) {
    const targetList = target.listId ? document.lists.find((list) => list.id === target.listId) : null;
    if (!targetList) return null;
    return {
      line: placement === 'before' ? targetList.startLine - 1 : targetList.endLine,
      indent: targetList.indent,
      listStyle: null,
      compact: false,
    };
  }

  return {
    line: placement === 'before' ? target.startLine - 1 : target.endLine,
    indent: target.indent,
    listStyle: source.isListItem ? (target.isListItem ? target.listStyle : source.listStyle) : null,
    compact: source.isListItem && target.isListItem,
  };
}

function getListStyle(list: List, body: string): MarkdownListStyle {
  const start = list.position?.start.offset ?? 0;
  const lineEnd = body.indexOf('\n', start);
  const line = body.slice(start, lineEnd === -1 ? undefined : lineEnd);
  const match = line.match(/^\s*([-+*]|\d+[.)])/);
  return { ordered: Boolean(list.ordered), marker: match?.[1] ?? (list.ordered ? '1.' : '-') };
}

function getListItemContentIndent(content: string, block: MarkdownBlock) {
  const lines = splitLines(content);
  const line = lines[block.startLine - 1]?.text ?? '';
  const match = line.slice(block.indent).match(/^([-+*]|\d+[.)])(\s+)/);
  return block.indent + (match ? match[0].length : 2);
}

function replaceListMarker(line: string, indent: number, style: MarkdownListStyle) {
  const prefix = line.slice(0, indent);
  const rest = line.slice(indent);
  const match = rest.match(/^([-+*]|\d+[.)])(\s+)/);
  if (!match) return line;
  const marker = style.ordered ? (style.marker.endsWith(')') ? '1)' : '1.') : style.marker;
  return `${prefix}${marker}${match[2]}${rest.slice(match[0].length)}`;
}

function reindentLines(lines: Line[], oldIndent: number, newIndent: number) {
  return lines.map((line) => {
    if (!line.text.trim()) return { ...line };
    const currentIndent = line.text.match(/^\s*/)?.[0].length ?? 0;
    const relativeIndent = Math.max(0, currentIndent - oldIndent);
    return { ...line, text: `${' '.repeat(newIndent + relativeIndent)}${line.text.slice(currentIndent)}` };
  });
}

function findBlock(document: MarkdownBlockDocument, id: string) {
  return document.blocks.find((block) => block.id === id) ?? null;
}

function isDescendant(document: MarkdownBlockDocument, candidateId: string, ancestorId: string) {
  let current = findBlock(document, candidateId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = findBlock(document, current.parentId);
  }
  return false;
}

function splitLines(content: string): Line[] {
  if (!content) return [];
  const lines: Line[] = [];
  const pattern = /(.*?)(\r\n|\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) && (match[0] || pattern.lastIndex < content.length)) {
    lines.push({ text: match[1], eol: match[2] });
    if (!match[2]) break;
  }
  return lines;
}

function joinLines(lines: Line[]) {
  return lines.map((line) => `${line.text}${line.eol}`).join('');
}

function ensureTrailingEol(lines: Line[], eol: string, hasFollowingLine: boolean) {
  if (hasFollowingLine && lines.length && !lines[lines.length - 1].eol) {
    lines[lines.length - 1] = { ...lines[lines.length - 1], eol };
  }
}

function cleanRemovalBoundary(lines: Line[], gapIndex: number, insertionLine: number) {
  let removeIndex = -1;
  if (gapIndex === 0 && lines[0]?.text === '') {
    removeIndex = 0;
  } else if (gapIndex >= lines.length && lines[lines.length - 1]?.text === '') {
    removeIndex = lines.length - 1;
  } else if (lines[gapIndex - 1]?.text === '' && lines[gapIndex]?.text === '') {
    removeIndex = gapIndex;
  }

  if (removeIndex >= 0) {
    lines.splice(removeIndex, 1);
    if (removeIndex < insertionLine) return insertionLine - 1;
  }
  return insertionLine;
}

function detectEol(content: string) {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function getLineOffset(content: string, offset: number) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function unchanged(document: MarkdownBlockDocument): MarkdownBlockMoveResult {
  return { content: document.content, changed: false };
}
