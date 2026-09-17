import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalNoteChangeError, displayNameFromSafUri, listVaultCore, listVaultFolderCore, parseVaultListCache, replaceVaultFolderChildren, saveNoteCore, splitFrontmatter, type VaultEntry, type VaultFiles } from '../localVaultCore';
import { buildBrowserRows, expandPath } from '../localVaultTree';

const directories = new Map<string, VaultEntry[]>();
const contents = new Map<string, string>();
const writeText = vi.fn(async (uri: string, text: string) => { contents.set(uri, text); });
const files: VaultFiles = {
  readDirectory: async (uri) => directories.get(uri) ?? [],
  readText: async (uri) => contents.get(uri) ?? '',
  writeText,
};

beforeEach(() => { directories.clear(); contents.clear(); writeText.mockClear(); });

describe('Android local vault adapter', () => {
  it('extracts names and keeps frontmatter bytes intact', () => {
    expect(displayNameFromSafUri('content://provider/tree/primary%3ANotes/document/primary%3ANotes%2F2025%2FWeek%201.md')).toBe('Week 1.md');
    expect(displayNameFromSafUri('content://provider/tree/primary%3ANotes/document/primary%3ANotes%2F2025/')).toBe('2025');
    expect(splitFrontmatter('---\r\nyear: 2025\r\n---\r\n# Note')).toEqual({ frontmatter: '---\r\nyear: 2025\r\n---\r\n', body: '# Note' });
  });

  it('uses provider display names even when document IDs are opaque', async () => {
    directories.set('root', [
      { uri: 'content://provider/tree/root/document/abc123', name: 'Projects', isDirectory: true },
      { uri: 'content://provider/tree/root/document/def456', name: 'Today.md', isDirectory: false },
    ]);
    const items = await listVaultFolderCore('root', '', files);
    expect(items.map((item) => [item.path, item.kind])).toEqual([['Projects', 'folder'], ['Today.md', 'note']]);
  });

  it('lists nested Markdown while excluding hidden folders and files', async () => {
    directories.set('root', [
      { uri: 'root/folder', isDirectory: true },
      { uri: 'root/.hidden', isDirectory: true },
      { uri: 'root/top.md', isDirectory: false },
      { uri: 'root/picture.png', isDirectory: false },
    ]);
    directories.set('root/folder', [{ uri: 'root/folder/nested.md', isDirectory: false }]);
    directories.set('root/.hidden', [{ uri: 'root/.hidden/secret.md', isDirectory: false }]);
    contents.set('root/top.md', 'top');
    contents.set('root/picture.png', 'image');
    contents.set('root/folder/nested.md', 'nested');
    const progress = vi.fn();
    const items = await listVaultCore('root', files, progress);
    expect(items.map((item) => item.path)).toEqual(['folder', 'folder/nested.md', 'top.md']);
    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ path: 'folder/nested.md' })]), 2);
    expect(buildBrowserRows(items, new Set(), '').map((row) => row.item.path)).toEqual(['folder', 'top.md']);
    expect(buildBrowserRows(items, new Set(['folder']), '').map((row) => [row.item.path, row.depth])).toEqual([
      ['folder', 0], ['folder/nested.md', 1], ['top.md', 0],
    ]);
    expect(buildBrowserRows(items, new Set(), 'nested').map((row) => row.item.path)).toEqual(['folder/nested.md']);
  });

  it('shows empty folders and sorts folders before notes at each level', async () => {
    directories.set('root', [
      { uri: 'root/z.md', isDirectory: false },
      { uri: 'root/Empty', isDirectory: true },
      { uri: 'root/Archive', isDirectory: true },
      { uri: 'root/a.md', isDirectory: false },
    ]);
    directories.set('root/Empty', []);
    directories.set('root/Archive', []);
    const items = await listVaultCore('root', files);
    expect(buildBrowserRows(items, new Set(), '').map((row) => row.item.name)).toEqual(['Archive', 'Empty', 'a.md', 'z.md']);
  });

  it('loads just the requested folder and preserves cached descendants until their parent disappears', async () => {
    const readDirectory = vi.fn(files.readDirectory);
    const adapter = { ...files, readDirectory };
    directories.set('root', [{ uri: 'root/Archive', isDirectory: true }]);
    directories.set('root/Archive', [{ uri: 'root/Archive/old.md', isDirectory: false }]);
    const root = await listVaultFolderCore('root', '', adapter);
    expect(readDirectory).toHaveBeenCalledTimes(1);
    expect(root.map((item) => item.path)).toEqual(['Archive']);
    const nested = await listVaultFolderCore('root/Archive', 'Archive', adapter);
    const cached = [...root, ...nested];
    expect(replaceVaultFolderChildren(cached, '', root).map((item) => item.path)).toEqual(['Archive/old.md', 'Archive']);
    expect(replaceVaultFolderChildren(cached, '', [])).toEqual([]);
    expect(replaceVaultFolderChildren(cached, '', [{ ...root[0], uri: 'root/new-Archive' }])).toEqual([{ ...root[0], uri: 'root/new-Archive' }]);
  });

  it('isolates cached listings by vault and rejects malformed records', () => {
    const items = [{ kind: 'note', uri: 'root/a.md', path: 'a.md', parentPath: '', name: 'a.md', size: 0 }];
    const cache = { version: 1, rootUri: 'root', items, complete: true };
    expect(parseVaultListCache(cache, 'root')).toEqual({ items, complete: true });
    expect(parseVaultListCache(cache, 'other-root')).toBeNull();
    expect(parseVaultListCache({ ...cache, items: [{ ...items[0], uri: null }] }, 'root')).toBeNull();
    expect(parseVaultListCache({ ...cache, version: 2 }, 'root')).toBeNull();
  });

  it('expands the ancestor chain of a newly created item', () => {
    expect([...expandPath(new Set(['Other']), 'Media/2025/Weeks')]).toEqual(['Other', 'Media', 'Media/2025', 'Media/2025/Weeks']);
  });

  it('refuses to overwrite a changed note', async () => {
    contents.set('note.md', 'changed elsewhere');
    await expect(saveNoteCore('note.md', 'old text', 'my draft', files)).rejects.toBeInstanceOf(ExternalNoteChangeError);
    expect(contents.get('note.md')).toBe('changed elsewhere');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('writes and verifies when the original bytes still match', async () => {
    contents.set('note.md', 'old text');
    await saveNoteCore('note.md', 'old text', 'new text', files);
    expect(contents.get('note.md')).toBe('new text');
  });
});
