import { describe, expect, it } from 'vitest';
import type { LocalVaultItem } from '../localVaultCore';
import { normalizeVaultPath, resolveLocalVaultImage } from '../vaultImages';

const items: LocalVaultItem[] = [
  { kind: 'image', uri: 'root-image', path: 'image.png', parentPath: '', name: 'image.png', size: 4, mimeType: 'image/png' },
  { kind: 'folder', uri: 'projects', path: 'Projects', parentPath: '', name: 'Projects' },
  { kind: 'image', uri: 'local-image', path: 'Projects/image.png', parentPath: 'Projects', name: 'image.png', size: 8, mimeType: 'image/png' },
];

describe('Android vault images', () => {
  it('prefers paths relative to the current note and supports root paths', () => {
    expect(resolveLocalVaultImage('image.png', 'Projects/note.md', items)?.uri).toBe('local-image');
    expect(resolveLocalVaultImage('/image.png', 'Projects/note.md', items)?.uri).toBe('root-image');
    expect(resolveLocalVaultImage('..%2Fimage.png', 'Projects/note.md', items)?.uri).toBe('root-image');
  });

  it('rejects external, malformed, and escaping image references', () => {
    expect(resolveLocalVaultImage('https://example.com/image.png', 'Projects/note.md', items)).toBeNull();
    expect(resolveLocalVaultImage('%E0%A4%A', 'Projects/note.md', items)).toBeNull();
    expect(normalizeVaultPath('../../outside.png')).toBeNull();
  });
});
