import { describe, expect, it } from 'vitest';
import { findLeadingEmoji } from './markdown';

describe('findLeadingEmoji', () => {
  it('finds a complete leading emoji after frontmatter and Markdown formatting', () => {
    expect(findLeadingEmoji('---\ntitle: 🛑 Ignore this\n---\n\n# **👩🏽‍💻 Project notes**')).toBe('👩🏽‍💻');
    expect(findLeadingEmoji('> ## 🇬🇧 Travel')).toBe('🇬🇧');
  });

  it('returns null when the first visible character is not an emoji', () => {
    expect(findLeadingEmoji('# Project 😀')).toBeNull();
    expect(findLeadingEmoji('---\nicon: 😀\n---\nPlain text')).toBeNull();
    expect(findLeadingEmoji('')).toBeNull();
  });
});
