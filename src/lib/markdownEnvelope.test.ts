import { describe, expect, it } from 'vitest';
import {
  areMarkdownBodiesSemanticallyEquivalent,
  checkRichMarkdownCompatibility,
  joinMarkdownEnvelope,
  splitMarkdownEnvelope,
} from './markdownEnvelope';

describe('Markdown rich-editor envelope', () => {
  it('preserves frontmatter, CRLF, and the final newline when joining rich content', () => {
    const source = '---\r\ntitle: Test\r\n---\r\nOld body\r\n';
    const envelope = splitMarkdownEnvelope(source);

    expect(envelope.frontmatterSource).toBe('---\r\ntitle: Test\r\n---\r\n');
    expect(joinMarkdownEnvelope(envelope, 'New\nbody\n\n')).toBe(
      '---\r\ntitle: Test\r\n---\r\nNew\r\nbody\r\n',
    );
  });

  it('does not add a final newline when the original note did not have one', () => {
    const envelope = splitMarkdownEnvelope('Body');
    expect(joinMarkdownEnvelope(envelope, 'Changed\n')).toBe('Changed');
  });

  it('accepts the rich editor core syntax', () => {
    const result = checkRichMarkdownCompatibility('# Heading\n\nSee [[Folder/Note]].\n\n![Diagram](assets/map.png "Map")\n\n- [x] task\n\n| A |\n| - |\n| B |');
    expect(result.compatible).toBe(true);
  });

  it.each([
    ['raw HTML', '<details>hidden</details>'],
    ['reference links', '[text][ref]\n\n[ref]: https://example.com'],
  ])('falls back for unsupported %s without changing the source', (_label, source) => {
    const result = checkRichMarkdownCompatibility(source);
    expect(result.compatible).toBe(false);
    expect(result.envelope.frontmatterSource + result.envelope.bodySource).toBe(source);
  });

  it('compares normalized Markdown semantically rather than by source spelling', () => {
    expect(areMarkdownBodiesSemanticallyEquivalent('- one\n- two\n', '* one\n* two\n')).toBe(true);
    expect(areMarkdownBodiesSemanticallyEquivalent('**bold**', 'plain')).toBe(false);
  });

  it('allows the rich editor to join adjacent empty unordered lists without overlooking content', () => {
    expect(areMarkdownBodiesSemanticallyEquivalent('-\n\n*', '*\n*')).toBe(true);
    expect(areMarkdownBodiesSemanticallyEquivalent('- one\n\n* two', '* one\n* two')).toBe(false);
    expect(areMarkdownBodiesSemanticallyEquivalent('-\n\n*', '*')).toBe(false);
  });
});
