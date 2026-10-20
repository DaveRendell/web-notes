import type { DriveFile } from '../web/src/types/drive';
import { GOOGLE_FOLDER_MIME_TYPE } from '../web/src/types/drive';
import type { LocalVaultItem } from './localVaultCore';

export type DriveLocation = { accountId: string; vaultId: string; fileId: string };
export function driveUri(location: DriveLocation): string {
  return `drive:${[location.accountId, location.vaultId, location.fileId].map(encodeURIComponent).join(':')}`;
}
export function parseDriveUri(uri: string): DriveLocation {
  const parts = uri.split(':');
  if (parts.length !== 4 || parts[0] !== 'drive' || parts.slice(1).some((part) => !part)) throw new Error('Invalid Drive vault location.');
  const [accountId, vaultId, fileId] = parts.slice(1).map(decodeURIComponent);
  return { accountId, vaultId, fileId };
}
export function driveItem(file: DriveFile, root: DriveLocation, parentPath: string): LocalVaultItem | null {
  if (file.name.startsWith('.')) return null;
  const common = { uri: driveUri({ ...root, fileId: file.id }), name: file.name, path: parentPath ? `${parentPath}/${file.name}` : file.name, parentPath };
  if (file.mimeType === GOOGLE_FOLDER_MIME_TYPE) return { ...common, kind: 'folder' };
  if (/\.md$/i.test(file.name)) return { ...common, kind: 'note', size: Number(file.size ?? 0), modifiedTime: file.modifiedTime };
  if (file.mimeType.startsWith('image/')) return { ...common, kind: 'image', mimeType: file.mimeType, size: Number(file.size ?? 0), modifiedTime: file.modifiedTime };
  return null;
}
export type CachedBody = { content: string; modifiedTime?: string };
export function validBody(value: unknown): value is CachedBody {
  return !!value && typeof value === 'object' && typeof (value as CachedBody).content === 'string' && ((value as CachedBody).modifiedTime === undefined || typeof (value as CachedBody).modifiedTime === 'string');
}
export function bodyMatches(body: CachedBody, modifiedTime?: string): boolean {
  return !!modifiedTime && body.modifiedTime === modifiedTime;
}
export type PendingWrite = { uri: string; original: string; content: string; originalModifiedTime?: string };
export function validQueue(value: unknown): value is PendingWrite[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.uri === 'string' && typeof item.original === 'string' && typeof item.content === 'string' && (item.originalModifiedTime === undefined || typeof item.originalModifiedTime === 'string'));
}
export function queueWrite(queue: PendingWrite[], write: PendingWrite): PendingWrite[] {
  const existing = queue.find((item) => item.uri === write.uri);
  return [...queue.filter((item) => item.uri !== write.uri), { ...write, original: existing?.original ?? write.original, ...(existing ? { originalModifiedTime: existing.originalModifiedTime } : {}) }];
}
