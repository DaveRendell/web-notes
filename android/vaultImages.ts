import type { LocalImage, LocalVaultItem } from './localVaultCore';

export type MobileImageReference = Pick<LocalImage, 'name' | 'path' | 'uri' | 'mimeType'>;

export function resolveLocalVaultImage(source: string, notePath: string, items: LocalVaultItem[]): LocalImage | null {
  if (/^[a-z][a-z\d+.-]*:/i.test(source) || source.startsWith('//')) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(source); } catch { return null; }
  const images = items.filter((item): item is LocalImage => item.kind === 'image');
  const rootPath = normalizeVaultPath(decoded);
  const noteFolder = notePath.split('/').slice(0, -1).join('/');
  const relativePath = normalizeVaultPath(`${noteFolder}/${decoded}`);
  if (!decoded.startsWith('/') && relativePath) {
    const relative = images.find((image) => image.path === relativePath);
    if (relative) return relative;
  }
  return rootPath ? images.find((image) => image.path === rootPath) ?? null : null;
}

export function normalizeVaultPath(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

