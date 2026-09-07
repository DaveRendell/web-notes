import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEmojiFaviconDataUrl, updatePageFavicon } from './pageFavicon';

beforeEach(() => {
  document.head.innerHTML = '<link rel="icon" type="image/svg+xml" href="/favicon.svg">';
});

afterEach(() => {
  document.head.innerHTML = '';
});

describe('page favicon', () => {
  it('creates an encoded SVG favicon containing the complete emoji', () => {
    const dataUrl = createEmojiFaviconDataUrl('👩🏽‍💻');

    expect(dataUrl).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(dataUrl.split(',')[1])).toContain('👩🏽‍💻');
  });

  it('uses a note emoji and restores the original favicon afterward', () => {
    updatePageFavicon('📚');
    const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');

    expect(favicon?.getAttribute('href')).toContain(encodeURIComponent('📚'));

    updatePageFavicon(null);
    expect(favicon?.getAttribute('href')).toBe('/favicon.svg');
  });

  it('creates a favicon link when the page does not already have one', () => {
    document.head.innerHTML = '';
    updatePageFavicon('🎯');

    expect(document.querySelector('link[rel~="icon"]')?.getAttribute('href')).toContain(
      encodeURIComponent('🎯'),
    );
  });
});
