import { describe, expect, it } from 'vitest';
import { getTwemojiUrl, splitEmojiText } from './twemoji';

describe('Twemoji helpers', () => {
  it('maps compound emoji to a pinned SVG asset', () => {
    expect(getTwemojiUrl('👩🏽‍💻')).toBe(
      'https://cdn.jsdelivr.net/gh/jdecked/twemoji@v17.0.2/assets/svg/1f469-1f3fd-200d-1f4bb.svg',
    );
  });

  it('splits text without changing UTF-16 content', () => {
    const parts = splitEmojiText('Before 📝 and 🇬🇧 after');
    expect(parts.map(({ emoji, text }) => ({ emoji, text }))).toEqual([
      { emoji: false, text: 'Before ' },
      { emoji: true, text: '📝' },
      { emoji: false, text: ' and ' },
      { emoji: true, text: '🇬🇧' },
      { emoji: false, text: ' after' },
    ]);
    expect(parts.map((part) => part.text).join('')).toBe('Before 📝 and 🇬🇧 after');
  });

  it('does not treat ordinary symbols as emoji', () => {
    expect(getTwemojiUrl(':)')).toBeNull();
    expect(splitEmojiText('plain text')).toEqual([{ emoji: false, text: 'plain text' }]);
  });
});
