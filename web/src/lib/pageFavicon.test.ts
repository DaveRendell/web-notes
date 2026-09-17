import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEmojiFaviconUrl, updatePageFavicon } from './pageFavicon';

beforeEach(() => {
  document.head.innerHTML = '<link rel="icon" type="image/svg+xml" href="/favicon.svg">';
});

afterEach(() => {
  document.head.innerHTML = '';
});

describe('page favicon', () => {
  it('creates a version-pinned Twemoji favicon URL for the complete emoji', () => {
    const url = createEmojiFaviconUrl('👩🏽‍💻');

    expect(url).toContain('twemoji@v17.0.2');
    expect(url).toMatch(/\/1f469-1f3fd-200d-1f4bb\.svg$/);
  });

  it('uses a note emoji and restores the original favicon afterward', () => {
    updatePageFavicon('📚');
    const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');

    expect(favicon?.getAttribute('href')).toMatch(/\/1f4da\.svg$/);

    updatePageFavicon(null);
    expect(favicon?.getAttribute('href')).toBe('/favicon.svg');
  });

  it('creates a favicon link when the page does not already have one', () => {
    document.head.innerHTML = '';
    updatePageFavicon('🎯');

    expect(document.querySelector('link[rel~="icon"]')?.getAttribute('href')).toMatch(/\/1f3af\.svg$/);
  });
});
