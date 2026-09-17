import type { VaultNode } from '../types/vault';
import { flattenVaultNodes } from './vaultTree';

export function formatImageSize(size?: string) {
  if (size === undefined || size.trim() === '') return 'Size unknown';
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return 'Size unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function resolveVaultImage(source: string, notePath: string, tree: VaultNode[]) {
  if (/^[a-z][a-z\d+.-]*:/i.test(source) || source.startsWith('//')) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(source); } catch { return null; }
  const normalize = (path: string) => {
    const parts: string[] = [];
    for (const part of path.split('/')) {
      if (part === '..') { if (!parts.length) return null; parts.pop(); }
      else if (part && part !== '.') parts.push(part);
    }
    return parts.join('/');
  };
  const images = flattenVaultNodes(tree).filter((node) => node.type === 'image');
  const relative = normalize(`${notePath.split('/').slice(0, -1).join('/')}/${decoded}`);
  const root = normalize(decoded);
  return (!decoded.startsWith('/') && images.find((node) => node.path === relative))
    || images.find((node) => node.path === root) || null;
}

export function imageMarkdown(path: string, alt: string) {
  const escapePunctuation = (value: string) => value.replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
  const encodedPath = /^https?:\/\//i.test(path)
    ? escapePunctuation(new URL(path).href)
    : path.split('/').map((part) => escapePunctuation(encodeURIComponent(part))).join('/');
  return `![${alt.replace(/[\\[\]]/g, '\\$&')}](${encodedPath})`;
}
