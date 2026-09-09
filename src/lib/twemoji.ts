import { parse, type EmojiEntity } from '@twemoji/parser';

const TWEMOJI_VERSION = '17.0.2';
const TWEMOJI_ASSET_ROOT = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@v${TWEMOJI_VERSION}/assets/svg`;

export function parseEmoji(text: string): EmojiEntity[] {
  return parse(text, {
    assetType: 'svg',
    buildUrl: (codepoints) => `${TWEMOJI_ASSET_ROOT}/${codepoints}.svg`,
  });
}

export function getTwemojiUrl(emoji: string): string | null {
  const entity = parseEmoji(emoji).find(({ indices }) => indices[0] === 0 && indices[1] === emoji.length);
  return entity?.url ?? null;
}

export function splitEmojiText(text: string): Array<{ emoji: boolean; text: string; url?: string }> {
  const entities = parseEmoji(text);
  if (entities.length === 0) return [{ emoji: false, text }];

  const parts: Array<{ emoji: boolean; text: string; url?: string }> = [];
  let offset = 0;
  for (const entity of entities) {
    if (entity.indices[0] > offset) {
      parts.push({ emoji: false, text: text.slice(offset, entity.indices[0]) });
    }
    parts.push({ emoji: true, text: entity.text, url: entity.url });
    offset = entity.indices[1];
  }
  if (offset < text.length) parts.push({ emoji: false, text: text.slice(offset) });
  return parts;
}
