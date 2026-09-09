import { getTwemojiUrl } from './twemoji';

const DEFAULT_FAVICON_PATH = `${import.meta.env.BASE_URL}favicon.svg`;
const DEFAULT_HREF_ATTRIBUTE = 'data-web-notes-default-href';

export function updatePageFavicon(emoji: string | null | undefined) {
  const favicon = getOrCreateFavicon();
  const defaultHref = favicon.getAttribute(DEFAULT_HREF_ATTRIBUTE) ?? DEFAULT_FAVICON_PATH;

  if (emoji) {
    favicon.setAttribute('href', createEmojiFaviconUrl(emoji));
  } else {
    favicon.setAttribute('href', defaultHref);
  }
}

export function createEmojiFaviconUrl(emoji: string) {
  const imageUrl = getTwemojiUrl(emoji);
  if (imageUrl) return imageUrl;

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    `<text y=".9em" font-size="90">${escapeXml(emoji)}</text>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function getOrCreateFavicon() {
  let favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');

  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/svg+xml';
    favicon.href = DEFAULT_FAVICON_PATH;
    document.head.append(favicon);
  }

  if (!favicon.hasAttribute(DEFAULT_HREF_ATTRIBUTE)) {
    favicon.setAttribute(DEFAULT_HREF_ATTRIBUTE, favicon.getAttribute('href') ?? DEFAULT_FAVICON_PATH);
  }

  return favicon;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
