import { describe, expect, it } from 'vitest';
import { createVaultNode } from './vaultTree';
import { formatImageSize, imageMarkdown, resolveVaultImage } from './vaultImages';

const root = createVaultNode({ id: 'root', name: 'photo.png', mimeType: 'image/png' }, '');
const nested = createVaultNode({ id: 'nested', name: 'photo.png', mimeType: 'image/png' }, 'Media');
const spaced = createVaultNode({ id: 'spaced', name: 'my photo.png', mimeType: 'image/png' }, 'Media');
describe('vault images', () => {
  it('formats image metadata sizes with a safe fallback', () => {
    expect(formatImageSize('0')).toBe('0 B');
    expect(formatImageSize('1536')).toBe('1.5 KB');
    expect(formatImageSize('1048576')).toBe('1.0 MB');
    for (const size of [undefined, '', 'oops', '-1']) expect(formatImageSize(size)).toBe('Size unknown');
  });
  it('recognizes images and prefers note-relative paths', () => {
    expect(root.type).toBe('image');
    expect(resolveVaultImage('photo.png', 'Media/note.md', [root, nested])).toBe(nested);
    expect(resolveVaultImage('/photo.png', 'Media/note.md', [root, nested])).toBe(root);
    expect(resolveVaultImage('../photo.png', 'Media/note.md', [root, nested])).toBe(root);
    expect(resolveVaultImage('my%20photo.png', 'Media/note.md', [spaced])).toBe(spaced);
  });
  it('rejects missing, malformed and non-vault references', () => {
    for (const source of ['%xx', '../../photo.png', 'https://example.com/photo.png', 'javascript:alert(1)', '//example.com/photo.png', 'missing.png']) {
      expect(resolveVaultImage(source, 'note.md', [root])).toBeNull();
    }
  });
  it('escapes Markdown paths and alt text without corrupting external URLs', () => {
    expect(imageMarkdown('/Media/my (photo).png', '[photo]')).toBe('![\\[photo\\]](/Media/my%20%28photo%29.png)');
    expect(imageMarkdown('https://example.com/a%20b.png?q=1&x=2', '')).toBe('![](https://example.com/a%20b.png?q=1&x=2)');
  });
});
