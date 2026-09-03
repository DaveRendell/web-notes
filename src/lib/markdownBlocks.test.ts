import { describe, expect, it } from 'vitest';
import {
  deleteMarkdownBlock,
  getMarkdownBlockActions,
  getMarkdownBlockMenuMove,
  moveMarkdownBlock,
  parseMarkdownBlocks,
} from './markdownBlocks';

function blockByText(content: string, text: string) {
  const document = parseMarkdownBlocks(content);
  const block = document.blocks.find((candidate) =>
    content.slice(candidate.startOffset, candidate.endOffset).includes(text),
  );
  if (!block) throw new Error(`Missing block containing ${text}`);
  return { block, document };
}

describe('Markdown block parsing', () => {
  it('keeps multiline paragraphs atomic and excludes frontmatter', () => {
    const content = '---\ntitle: Test\n---\nfirst line\nsecond line\n\n## Heading\n';
    const document = parseMarkdownBlocks(content);

    expect(document.blocks).toHaveLength(2);
    expect(content.slice(document.blocks[0].startOffset, document.blocks[0].endOffset)).toBe(
      'first line\nsecond line',
    );
    expect(document.blocks[1].kind).toBe('heading');
  });

  it('models list items as a hierarchy and exposes continuation blocks once', () => {
    const content = '- parent\n  - child\n\n    continuation\n- sibling\n';
    const document = parseMarkdownBlocks(content);
    const parent = document.blocks.find((block) => block.isListItem && block.parentId === null)!;
    const child = document.blocks.find((block) => block.isListItem && block.parentId === parent.id)!;
    const continuation = document.blocks.find((block) => block.kind === 'paragraph' && block.parentId === child.id)!;

    expect(parent.childIds).toContain(child.id);
    expect(child.childIds).toContain(continuation.id);
    expect(document.blocks.filter((block) => block.kind === 'paragraph')).toHaveLength(1);
  });

  it('discovers complex root constructs as whole blocks', () => {
    const content = '> quoted\n> text\n\n```ts\nconst value = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n---\n';
    const document = parseMarkdownBlocks(content);
    expect(document.blocks.map((block) => block.kind)).toEqual(['blockquote', 'code', 'table', 'thematicBreak']);
  });
});

describe('Markdown block moves', () => {
  it('deletes a semantic block without touching frontmatter', () => {
    const content = '---\ntitle: Test\n---\n\nAlpha\n\nBeta\n';
    const document = parseMarkdownBlocks(content);
    const result = deleteMarkdownBlock(document, document.blocks[0].id);

    expect(result).toEqual({ content: '---\ntitle: Test\n---\n\nBeta\n', changed: true });
  });

  it('deletes a list item together with its nested subtree', () => {
    const content = '- parent\n  - child\n- sibling\n';
    const document = parseMarkdownBlocks(content);
    const result = deleteMarkdownBlock(document, document.blocks[0].id);

    expect(result.content).toBe('- sibling\n');
  });

  it('reorders root blocks without changing frontmatter', () => {
    const content = '---\ntitle: Test\n---\n\nAlpha\n\nBeta\n';
    const document = parseMarkdownBlocks(content);
    const alpha = document.blocks[0];
    const beta = document.blocks[1];
    const result = moveMarkdownBlock(document, { sourceId: beta.id, targetId: alpha.id, placement: 'before' });

    expect(result.changed).toBe(true);
    expect(result.content).toBe('---\ntitle: Test\n---\n\nBeta\n\nAlpha\n');
  });

  it('moves a list item with its descendants', () => {
    const content = '- first\n  - child\n- second\n';
    const document = parseMarkdownBlocks(content);
    const [first, second] = document.blocks.filter((block) => block.parentId === null);
    const result = moveMarkdownBlock(document, { sourceId: first.id, targetId: second.id, placement: 'after' });

    expect(result.content).toBe('- second\n- first\n  - child\n');
  });

  it('nests list items and preserves checkbox state', () => {
    const content = '- [ ] task\n- parent\n';
    const document = parseMarkdownBlocks(content);
    const [task, parent] = document.blocks;
    const result = moveMarkdownBlock(document, { sourceId: task.id, targetId: parent.id, placement: 'nest' });

    expect(result.content).toBe('- parent\n  - [ ] task\n');
  });

  it('adopts a destination ordered-list marker', () => {
    const content = '- bullet\n\n1. first\n2. second\n';
    const document = parseMarkdownBlocks(content);
    const bullet = document.blocks.find((block) => content.slice(block.startOffset, block.endOffset).includes('bullet'))!;
    const second = document.blocks.find((block) => content.slice(block.startOffset, block.endOffset).includes('second'))!;
    const result = moveMarkdownBlock(document, { sourceId: bullet.id, targetId: second.id, placement: 'before' });

    expect(result.content).toContain('1. first\n1. bullet\n2. second');
  });

  it('creates a separated standalone list beside a root block', () => {
    const content = '- bullet\n\nParagraph\n';
    const document = parseMarkdownBlocks(content);
    const bullet = document.blocks.find((block) => block.isListItem)!;
    const paragraph = document.blocks.find((block) => block.kind === 'paragraph')!;
    const result = moveMarkdownBlock(document, { sourceId: bullet.id, targetId: paragraph.id, placement: 'after' });

    expect(result.content).toBe('Paragraph\n\n- bullet\n');
  });

  it('nests and outdents a non-list block', () => {
    const content = '- parent\n\nParagraph\n';
    const document = parseMarkdownBlocks(content);
    const parent = document.blocks.find((block) => block.isListItem)!;
    const paragraph = document.blocks.find((block) => block.kind === 'paragraph')!;
    const nested = moveMarkdownBlock(document, { sourceId: paragraph.id, targetId: parent.id, placement: 'nest' });
    expect(nested.content).toBe('- parent\n\n  Paragraph\n');

    const nestedDocument = parseMarkdownBlocks(nested.content);
    const nestedParagraph = nestedDocument.blocks.find((block) => block.kind === 'paragraph')!;
    const outdented = moveMarkdownBlock(nestedDocument, { sourceId: nestedParagraph.id, placement: 'outdent' });
    expect(outdented.content).toBe('- parent\n\nParagraph\n');
  });

  it('rejects self and descendant drops', () => {
    const content = '- parent\n  - child\n';
    const document = parseMarkdownBlocks(content);
    const parent = document.blocks.find((block) => block.parentId === null)!;
    const child = document.blocks.find((block) => block.parentId === parent.id)!;

    expect(moveMarkdownBlock(document, { sourceId: parent.id, targetId: parent.id, placement: 'after' }).changed).toBe(false);
    expect(moveMarkdownBlock(document, { sourceId: parent.id, targetId: child.id, placement: 'nest' }).changed).toBe(false);
  });

  it('preserves CRLF line endings', () => {
    const content = 'Alpha\r\n\r\nBeta\r\n';
    const document = parseMarkdownBlocks(content);
    const result = moveMarkdownBlock(document, {
      sourceId: document.blocks[1].id,
      targetId: document.blocks[0].id,
      placement: 'before',
    });
    expect(result.content).toBe('Beta\r\n\r\nAlpha\r\n');
  });

  it('does not normalize blank lines outside the moved boundaries', () => {
    const content = 'Alpha\n\n\nBeta\n\nGamma\n';
    const document = parseMarkdownBlocks(content);
    const result = moveMarkdownBlock(document, {
      sourceId: document.blocks[2].id,
      targetId: document.blocks[1].id,
      placement: 'before',
    });
    expect(result.content).toBe('Alpha\n\n\nGamma\n\nBeta\n');
  });

  it('builds keyboard moves from sibling structure', () => {
    const content = '- parent\n- child\n';
    const { block: child, document } = blockByText(content, 'child');
    expect(getMarkdownBlockActions(document, child.id)).toEqual({
      canMoveUp: true,
      canMoveDown: false,
      canIndent: true,
      canOutdent: false,
    });
    expect(getMarkdownBlockMenuMove(document, child.id, 'indent')).toEqual({
      sourceId: child.id,
      targetId: document.blocks[0].id,
      placement: 'nest',
    });
  });
});
