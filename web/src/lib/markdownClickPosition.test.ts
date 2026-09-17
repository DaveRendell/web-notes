import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Link, Root, Text } from 'mdast';
import {
  createMarkdownSourcePositionPlugin,
  createRemarkSourceBreaksPlugin,
  createRemarkWikilinkPlugin,
  getMarkdownClickOffset,
  mapRenderedTextOffset,
} from './markdownClickPosition';

afterEach(() => {
  vi.restoreAllMocks();
  document.getSelection()?.removeAllRanges();
});

describe('Markdown click source metadata', () => {
  it('preserves source ranges for formatted text and soft line breaks', () => {
    const body = '# **Large** heading\n\nfirst\nnext line';
    const tree = processMarkdown(body, 20);
    const texts = collectNodes<Text>(tree, 'text');
    const breakNode = collectNodes(tree, 'break')[0];

    expect(texts.map((node) => [node.value, node.data?.hProperties])).toEqual([
      ['Large', expect.objectContaining({ dataMarkdownSourceStart: 24, dataMarkdownSourceEnd: 29 })],
      [' heading', expect.objectContaining({ dataMarkdownSourceStart: 31, dataMarkdownSourceEnd: 39 })],
      ['first', expect.objectContaining({ dataMarkdownSourceStart: 41, dataMarkdownSourceEnd: 46 })],
      ['next line', expect.objectContaining({ dataMarkdownSourceStart: 47, dataMarkdownSourceEnd: 56 })],
    ]);
    expect(breakNode.position?.start.offset).toBe(26);
  });

  it('turns wikilinks into positioned links without changing their visible source location', () => {
    const body = 'See &amp; \\* [[Projects/Roadmap|the plan]] and [[People/Ada#Bio]].';
    const tree = processMarkdown(body, 0);
    const links = collectNodes<Link>(tree, 'link');

    expect(links.map((link) => [link.url, (link.children[0] as Text).value])).toEqual([
      ['#wikilink=Projects%2FRoadmap', 'the plan'],
      ['#wikilink=People%2FAda', 'Ada'],
    ]);
    expect((links[0].children[0] as Text).data?.hProperties).toEqual(expect.objectContaining({
      dataMarkdownSourceStart: body.indexOf('the plan'),
      dataMarkdownSourceEnd: body.indexOf('the plan') + 'the plan'.length,
    }));
    expect((links[1].children[0] as Text).data?.hProperties).toEqual(expect.objectContaining({
      dataMarkdownSourceStart: body.indexOf('Ada'),
      dataMarkdownSourceEnd: body.indexOf('Ada') + 3,
    }));
  });

  it('maps rendered boundaries through escapes, entities, CRLF, and source indentation', () => {
    expect(mapRenderedTextOffset('A \\* and B', 2, 4, '*', 1)).toBe(4);
    expect(mapRenderedTextOffset('A &amp; B', 2, 7, '&', 1)).toBe(7);
    expect(mapRenderedTextOffset('one\r\ntwo', 0, 8, 'one\ntwo', 4)).toBe(5);
    expect(mapRenderedTextOffset('    indented', 0, 12, 'indented', 3)).toBe(7);
    expect(mapRenderedTextOffset('😀 note', 0, 7, '😀 note', 2)).toBe(2);
  });

  it('marks the editable content inside inline and fenced code delimiters', () => {
    const body = '`inline`\n\n```js\nconst x = 1;\n```';
    const tree = processMarkdown(body, 10);
    const inlineCode = collectNodes(tree, 'inlineCode')[0];
    const fencedCode = collectNodes(tree, 'code')[0];

    expect(inlineCode.data?.hProperties).toEqual(expect.objectContaining({
      dataMarkdownSourceStart: 11,
      dataMarkdownSourceEnd: 17,
    }));
    expect(fencedCode.data?.hProperties).toEqual(expect.objectContaining({
      dataMarkdownSourceStart: 10 + body.indexOf('const'),
      dataMarkdownSourceEnd: 10 + body.lastIndexOf('```'),
    }));
  });
});

describe('getMarkdownClickOffset', () => {
  it('uses native caret hit testing to resolve an exact rendered offset', () => {
    const root = document.createElement('article');
    root.innerHTML = '<div data-markdown-block-source-start="0"><span data-markdown-source-start="3" data-markdown-source-end="8">Title</span></div>';
    document.body.append(root);
    const span = root.querySelector('span')!;
    const text = span.firstChild!;
    setCaretPosition(text, 2);

    expect(getMarkdownClickOffset(root, { clientX: 10, clientY: 20, target: span }, '## Title')).toBe(5);
    root.remove();
  });

  it('uses the legacy caret range fallback', () => {
    const root = document.createElement('article');
    root.innerHTML = '<span data-markdown-source-start="0" data-markdown-source-end="4">body</span>';
    document.body.append(root);
    const span = root.querySelector('span')!;
    const range = document.createRange();
    range.setStart(span.firstChild!, 3);
    Object.defineProperty(document, 'caretPositionFromPoint', { configurable: true, value: undefined });
    Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => range });

    expect(getMarkdownClickOffset(root, { clientX: 0, clientY: 0, target: span }, 'body')).toBe(3);
    root.remove();
  });

  it('ignores interactive content, selected text, and blank block space', () => {
    const root = document.createElement('article');
    root.innerHTML = '<div data-markdown-block-source-start="0"><a href="#"><span data-markdown-source-start="0" data-markdown-source-end="4">link</span></a></div>';
    document.body.append(root);
    const span = root.querySelector('span')!;
    setCaretPosition(span.firstChild!, 2);
    expect(getMarkdownClickOffset(root, { clientX: 0, clientY: 0, target: span }, 'link')).toBeNull();

    const selection = document.getSelection()!;
    const selectionRange = document.createRange();
    selectionRange.selectNodeContents(span);
    selection.addRange(selectionRange);
    expect(getMarkdownClickOffset(root, { clientX: 0, clientY: 0, target: root.firstElementChild }, 'link')).toBeNull();
    selection.removeAllRanges();

    setCaretPosition(root.firstElementChild!, 0);
    expect(getMarkdownClickOffset(root, { clientX: 0, clientY: 0, target: root.firstElementChild }, 'link')).toBeNull();
    root.remove();
  });
});

function processMarkdown(body: string, bodyStartOffset: number) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(createRemarkWikilinkPlugin(body))
    .use(createRemarkSourceBreaksPlugin(body))
    .use(createMarkdownSourcePositionPlugin(body, bodyStartOffset));
  return processor.runSync(processor.parse(body)) as Root;
}

function collectNodes<T = Root['children'][number]>(root: Root, type: string) {
  const result: T[] = [];
  function collect(node: Root | Root['children'][number]) {
    if (node.type === type) result.push(node as T);
    if ('children' in node) node.children.forEach((child) => collect(child));
  }
  collect(root);
  return result;
}

function setCaretPosition(node: Node, offset: number) {
  Object.defineProperty(document, 'caretPositionFromPoint', {
    configurable: true,
    value: () => ({ offsetNode: node, offset }),
  });
  Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: undefined });
}
