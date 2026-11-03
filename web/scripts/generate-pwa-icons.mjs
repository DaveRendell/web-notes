import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const source = await readFile(new URL('../public/pwa-icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });

try {
  for (const [filename, size] of [
    ['pwa-192x192.png', 192],
    ['pwa-512x512.png', 512],
    ['pwa-maskable-512x512.png', 512],
    ['apple-touch-icon.png', 180],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    // Desktop app icons retain transparency. Maskable launchers need an
    // opaque safe-area background because they crop the complete image.
    const artwork = filename.includes('maskable')
      ? source.replace(/(<svg[^>]*>)/, '$1<rect width="512" height="512" fill="#49627f"/>')
      : source;
    await page.setContent(`
      <!doctype html>
      <style>html, body, svg { width: 100%; height: 100%; margin: 0; display: block; }</style>
      ${artwork}
    `);
    await page.screenshot({ path: new URL(`../public/${filename}`, import.meta.url).pathname, omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
