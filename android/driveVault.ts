import { createDriveFolder, createDriveMarkdownFile, findDriveChildByName, getDriveFileText, GoogleDriveError, listDriveChildren, updateDriveFileText } from '../web/src/lib/googleDrive';
import { getNewNoteContent } from '../web/src/lib/noteDefaults';
import type { DriveFile } from '../web/src/types/drive';
import { connectDrive, restoreDriveUser, withDriveToken } from './driveAuth';
import { mobileCache } from './mobileCache';
import { bodyMatches, driveItem, driveUri, parseDriveUri, queueWrite, validBody, validQueue, type PendingWrite } from './driveVaultCore';
import { openLocalWeeklyNoteCore, parseVaultListCache, readLocalWeeklyTemplateCore, splitFrontmatter, type LocalFolder, type LocalImage, type LocalNote, type LocalVaultItem, type VaultListCache } from './localVaultCore';
import { parseVaultSettings } from '../web/src/lib/vaultSettings';
import { parseNoteIconCache } from './vaultFeatures';

export { splitFrontmatter, type LocalFolder, type LocalImage, type LocalNote, type LocalVaultItem };
export { readThemePreference, writeThemePreference, type ThemePreference } from './mobilePreferences';

type Session = { accountId: string; googleUserId: string; vaultId: string };
function validSession(value: unknown): value is Session {
  return !!value && typeof value === 'object' && ['accountId', 'googleUserId', 'vaultId'].every((key) => typeof (value as Record<string, unknown>)[key] === 'string');
}
let session: Session | null = null;
const trees = new Map<string, LocalVaultItem[]>();
const treeCompleteness = new Map<string, boolean>();
const versions = new Map<string, number>();
const listeners = new Set<(status: string | null) => void>();
let lastStatus: string | null = null;
function status(message: string | null) { lastStatus = message; listeners.forEach((listener) => listener(message)); }
export function subscribeDriveStatus(listener: (message: string | null) => void) { listeners.add(listener); listener(lastStatus); return () => { listeners.delete(listener); }; }
let serial: Promise<unknown> = Promise.resolve();
function exclusively<T>(operation: () => Promise<T>): Promise<T> {
  const next = serial.catch(() => {}).then(operation);
  serial = next;
  return next;
}
function rootFor(uri: string) { const location = parseDriveUri(uri); return driveUri({ ...location, fileId: location.vaultId }); }
async function assertAccount(uri: string) {
  const location = parseDriveUri(uri);
  if (!session || session.accountId !== location.accountId || session.vaultId !== location.vaultId || await restoreDriveUser() !== session.googleUserId) throw new Error('Reconnect the account that owns this vault. Your local changes are preserved.');
  return location;
}
function withVaultToken<T>(uri: string, operation: (token: string) => Promise<T>): Promise<T> {
  const location = parseDriveUri(uri);
  if (!session || session.accountId !== location.accountId || session.vaultId !== location.vaultId) throw new Error('The active vault changed. Your local data is preserved.');
  return withDriveToken(operation, session.googleUserId);
}
export async function connectVaultAccount() { return connectDrive(); }
export async function reconnectCurrentVault(): Promise<void> {
  const account = await connectDrive();
  if (!session || account.accountId !== session.accountId) throw new Error('Choose the original Drive account to reconnect this vault. Your draft has been preserved.');
  session = { ...session, googleUserId: account.googleUserId };
  await mobileCache.putRequired('session', session);
}
export async function listDriveFolders(folderId: string) {
  return withDriveToken((accessToken) => listDriveChildren({ accessToken, folderId, foldersOnly: true }));
}
export async function selectDriveVault(account: { accountId: string; googleUserId: string }, vaultId: string): Promise<string> {
  const nextSession = { ...account, vaultId };
  await mobileCache.putRequired('session', nextSession);
  session = nextSession;
  const root = driveUri({ ...session, fileId: vaultId });
  trees.delete(root);
  return root;
}
export async function restoreVault(): Promise<string | null> {
  const saved = await mobileCache.get('session', validSession);
  if (!saved || await restoreDriveUser() !== saved.googleUserId) return null;
  session = saved;
  return driveUri({ ...saved, fileId: saved.vaultId });
}
export async function readVaultListCache(root: string): Promise<VaultListCache | null> {
  await assertAccount(root);
  const cached = await mobileCache.get(`tree:${root}`, (value): value is { version: number; rootUri: string; items: LocalVaultItem[]; complete: boolean } => !!parseVaultListCache(value, root));
  if (!cached) return null;
  trees.set(root, cached.items);
  treeCompleteness.set(root, cached.complete);
  return { items: cached.items, complete: cached.complete };
}
export async function readNoteIconCache(root: string): Promise<Record<string, string | null>> {
  await assertAccount(root);
  const cached = await mobileCache.get(`icons:${root}`, (value): value is { version: 1; rootUri: string; icons: Record<string, string | null> } => !!parseNoteIconCache(value, root));
  return cached?.icons ?? {};
}
export async function writeNoteIconCache(root: string, icons: Record<string, string | null>) {
  await mobileCache.put(`icons:${root}`, { version: 1, rootUri: root, icons });
}
export async function writeVaultListCache(root: string, items: LocalVaultItem[], complete: boolean) {
  // Preserve metadata confirmed by an in-flight write when React still holds an older snapshot.
  const known = trees.get(root) ?? [];
  const merged = items.map((item) => {
    const latest = known.find((candidate) => candidate.uri === item.uri);
    return latest && latest.kind !== 'folder' && item.kind !== 'folder' && latest.modifiedTime && (!item.modifiedTime || latest.modifiedTime > item.modifiedTime) ? { ...item, modifiedTime: latest.modifiedTime } : item;
  });
  trees.set(root, merged);
  treeCompleteness.set(root, complete);
  await mobileCache.put(`tree:${root}`, { version: 1, rootUri: root, items: merged, complete });
}
export async function listVaultFolder(root: string, folderUri: string, parentPath: string): Promise<LocalVaultItem[]> {
  const location = await assertAccount(root);
  const children = await withVaultToken(root, (accessToken) => listDriveChildren({ accessToken, folderId: parseDriveUri(folderUri).fileId }));
  return children.map((file) => driveItem(file, location, parentPath)).filter((item): item is LocalVaultItem => !!item);
}
export async function listVault(root: string): Promise<LocalVaultItem[]> {
  const previous = trees.get(root) ?? [];
  const items: LocalVaultItem[] = [];
  const folders = [{ uri: root, path: '' }];
  const visited = new Set<string>();
  while (folders.length) {
    // Parallelize independent folder requests without overwhelming Drive.
    const batch = folders.splice(0, 6);
    const results = await Promise.all(batch.map(async (folder) => {
      if (visited.has(folder.uri)) throw new Error('Drive returned a cyclic folder tree.');
      visited.add(folder.uri);
      return listVaultFolder(root, folder.uri, folder.path);
    }));
    for (const children of results) for (const child of children) {
      items.push(child);
      if (child.kind === 'folder') folders.push({ uri: child.uri, path: child.path });
    }
  }
  const queued = await queueFor(root);
  const present = new Set(items.map((item) => item.uri));
  // Deleted remote notes with pending local changes remain recoverable in the picker.
  const missingWrites = queued.filter((write) => !present.has(write.uri));
  for (const write of missingWrites) {
    const note = previous.find((item) => item.uri === write.uri);
    if (!note) continue;
    for (const ancestor of previous.filter((item) => item.uri === note.uri || item.kind === 'folder' && note.path.startsWith(`${item.path}/`))) {
      if (!items.some((item) => item.uri === ancestor.uri)) items.push(ancestor);
    }
  }
  items.sort((a, b) => a.path.localeCompare(b.path));
  await writeVaultListCache(root, items, true);
  // Only complete successful listings can invalidate bodies. Never discard pending edits.
  for (const old of previous) if (!present.has(old.uri) && !queued.some((write) => write.uri === old.uri)) {
    await mobileCache.delete(`body:${old.uri}`);
    await mobileCache.delete(`image:${old.uri}`);
  }
  return trees.get(root)!;
}
async function queueFor(root: string) { return await mobileCache.getRequired(`writes:${root}`, validQueue) ?? []; }
async function metadata(uri: string): Promise<DriveFile> {
  const location = await assertAccount(uri);
  return withVaultToken(uri, async (token) => {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(location.fileId)}?fields=id,name,mimeType,parents,modifiedTime,size&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new GoogleDriveError('Could not check the Drive file version.', response.status);
    return response.json();
  });
}
async function downloadNote(uri: string) {
  const location = await assertAccount(uri);
  // Never label content with a timestamp from an earlier listing.
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await metadata(uri);
    const content = await withVaultToken(uri, (token) => getDriveFileText(token, location.fileId));
    const after = await metadata(uri);
    if (before.modifiedTime === after.modifiedTime) return { content, modifiedTime: after.modifiedTime };
  }
  throw new Error('This note is changing on Drive. Try again shortly.');
}
export async function readNote(uri: string, onRefresh?: (content: string) => void, onError?: (error: unknown) => void): Promise<string> {
  await assertAccount(uri);
  const root = rootFor(uri);
  const queued = (await queueFor(root)).find((write) => write.uri === uri);
  if (queued) return queued.content;
  const cached = await mobileCache.get(`body:${uri}`, validBody);
  const listed = trees.get(root)?.find((item) => item.uri === uri);
  if (cached && listed && listed.kind !== 'folder' && bodyMatches(cached, listed.modifiedTime)) return cached.content;
  const refresh = async () => {
    const version = versions.get(uri) ?? 0;
    const body = await downloadNote(uri);
    // A local save may have started while the network read was pending.
    if ((await queueFor(root)).some((write) => write.uri === uri) || (versions.get(uri) ?? 0) !== version) return;
    await mobileCache.put(`body:${uri}`, body);
    onRefresh?.(body.content);
    return body.content;
  };
  if (cached && onRefresh) {
    void refresh().catch((cause) => { console.warn('Keeping cached note after Drive refresh failed:', cause); onError?.(cause); });
    return cached.content;
  }
  try { return await refresh() ?? cached?.content ?? ''; }
  catch (cause) { if (cached) return cached.content; throw cause; }
}
async function confirmWrite(write: PendingWrite) {
  const root = rootFor(write.uri);
  const checked = await metadata(write.uri);
  const remote = write.originalModifiedTime && checked.modifiedTime === write.originalModifiedTime
    ? { content: write.original }
    : await downloadNote(write.uri);
  if (remote.content !== write.content && remote.content !== write.original) throw new Error('This note changed on Google Drive. Your local version is preserved; resolve the conflict before syncing.');
  const file = remote.content === write.content ? await metadata(write.uri) : await withVaultToken(write.uri, (token) => updateDriveFileText(token, parseDriveUri(write.uri).fileId, write.content));
  await mobileCache.put(`body:${write.uri}`, { content: write.content, modifiedTime: file.modifiedTime });
  const tree = trees.get(root);
  if (tree) await writeVaultListCache(root, tree.map((item) => item.uri === write.uri ? { ...item, modifiedTime: file.modifiedTime, size: Number(file.size ?? 0) } : item), treeCompleteness.get(root) ?? false);
}
function isNetworkFailure(cause: unknown) { return cause instanceof TypeError && /network|fetch|internet/i.test(cause.message); }
export async function saveNote(uri: string, expectedOriginal: string, content: string): Promise<void> {
  versions.set(uri, (versions.get(uri) ?? 0) + 1);
  return exclusively(async () => {
    await assertAccount(uri);
    const root = rootFor(uri);
    const cached = await mobileCache.get(`body:${uri}`, validBody);
    const queue = queueWrite(await queueFor(root), { uri, original: expectedOriginal, content, ...(cached?.content === expectedOriginal && cached.modifiedTime ? { originalModifiedTime: cached.modifiedTime } : {}) });
    // Persist before any network write. Killed apps and transient errors cannot lose the draft.
    await mobileCache.putRequired(`writes:${root}`, queue);
    await mobileCache.put(`body:${uri}`, { content });
    status('Syncing…');
    try {
      await confirmWrite(queue.find((write) => write.uri === uri)!);
      const remaining = queue.filter((write) => write.uri !== uri);
      await mobileCache.putRequired(`writes:${root}`, remaining);
      status(remaining.length ? 'Changes saved locally; waiting to sync' : null);
    } catch (cause) {
      status(isNetworkFailure(cause) ? 'Changes saved locally; waiting to sync' : String(cause));
      if (!isNetworkFailure(cause)) throw cause;
    }
  });
}
/** Explicit conflict resolution only: never silently replace the remote baseline. */
export async function overwritePendingNote(uri: string, localContent?: string): Promise<void> {
  return exclusively(async () => {
    await assertAccount(uri);
    const root = rootFor(uri);
    const queue = await queueFor(root);
    const write = queue.find((item) => item.uri === uri);
    if (!write) throw new Error('This note has no pending local save to resolve.');
    const remote = await downloadNote(uri);
    const revised = { ...write, content: localContent ?? write.content, original: remote.content, originalModifiedTime: remote.modifiedTime };
    versions.set(uri, (versions.get(uri) ?? 0) + 1);
    await mobileCache.putRequired(`writes:${root}`, queue.map((item) => item.uri === uri ? revised : item));
    await confirmWrite(revised);
    await mobileCache.putRequired(`writes:${root}`, queue.filter((item) => item.uri !== uri));
    status(queue.length > 1 ? 'Changes saved locally; waiting to sync' : null);
  });
}
export async function syncPendingWrites(root: string): Promise<void> {
  return exclusively(async () => {
    await assertAccount(root);
    let queue = await queueFor(root);
    if (!queue.length) { status(null); return; }
    status('Syncing…');
    for (const write of [...queue]) {
      try {
        await confirmWrite(write);
        queue = queue.filter((item) => item.uri !== write.uri);
        await mobileCache.putRequired(`writes:${root}`, queue);
      } catch (cause) {
        status(String(cause));
        if (isNetworkFailure(cause)) return;
        // Keep the conflict durable but allow unrelated notes to sync.
      }
    }
    if (!queue.length) status(null);
  });
}
export async function readVaultFavourites(root: string, onRefresh?: (ids: string[]) => void): Promise<string[]> {
  await assertAccount(root);
  const cacheKey = `favourite-ids:${root}`;
  const cached = await mobileCache.get(cacheKey, (value): value is string[] => Array.isArray(value) && value.every((id) => typeof id === 'string'));
  const refresh = async () => {
    const file = await withVaultToken(root, (accessToken) => findDriveChildByName({ accessToken, folderId: parseDriveUri(root).vaultId, name: '.web-notes.json' }));
    const settings = file ? parseVaultSettings(await withVaultToken(root, (token) => getDriveFileText(token, file.id))) : null;
    const ids = settings?.favourites ?? [];
    await mobileCache.put(cacheKey, ids);
    return ids;
  };
  if (cached) {
    void refresh().then((ids) => onRefresh?.(ids)).catch((cause) => console.warn('Could not refresh cached favourites:', cause));
    return cached;
  }
  return refresh();
}
function validateName(name: string) {
  if (!name.trim() || name.startsWith('.') || /[\\/\x00-\x1f]/.test(name)) throw new Error('Enter a name without a leading dot, slashes, or control characters.');
}
async function rememberCreated(parent: string, parentPath: string, file: DriveFile) {
  const item = driveItem(file, parseDriveUri(parent), parentPath)!;
  const root = rootFor(parent);
  await writeVaultListCache(root, [...(trees.get(root) ?? []), item], false);
  return item;
}
export async function createNote(parent: string, path: string, name: string): Promise<LocalNote> {
  await assertAccount(parent); validateName(name);
  const file = await withVaultToken(parent, (token) => createDriveMarkdownFile(token, parseDriveUri(parent).fileId, name));
  const item = await rememberCreated(parent, path, file) as LocalNote;
  await mobileCache.put(`body:${item.uri}`, { content: getNewNoteContent(name), modifiedTime: file.modifiedTime });
  return item;
}
export async function createFolder(parent: string, path: string, name: string): Promise<LocalFolder> {
  await assertAccount(parent); validateName(name);
  return await rememberCreated(parent, path, await withVaultToken(parent, (token) => createDriveFolder(token, parseDriveUri(parent).fileId, name))) as LocalFolder;
}
export async function readImageData(uri: string, mimeType: string): Promise<string> {
  await assertAccount(uri);
  const listed = trees.get(rootFor(uri))?.find((item) => item.uri === uri);
  const cached = await mobileCache.get(`image:${uri}`, validBody);
  if (cached && listed?.kind === 'image' && bodyMatches(cached, listed.modifiedTime)) return cached.content;
  try {
    const file = await metadata(uri);
    const data = await withVaultToken(uri, async (token) => {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parseDriveUri(uri).fileId)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new GoogleDriveError('Could not load image.', response.status);
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not decode image.')); reader.readAsDataURL(blob);
      });
    });
    await mobileCache.put(`image:${uri}`, { content: data || `data:${mimeType};base64,`, modifiedTime: file.modifiedTime });
    return data;
  } catch (cause) { if (cached) return cached.content; throw cause; }
}
export async function createImage(parent: string, path: string, name: string, mimeType: string, base64: string): Promise<LocalImage> {
  await assertAccount(parent); validateName(name);
  if (!mimeType.startsWith('image/') || base64.length > 28_000_000) throw new Error('Choose an image no larger than 20 MB.');
  const file = await withVaultToken(parent, async (token) => {
    // Drive multipart accepts base64 transfer encoding; no browser File/Blob dependency.
    const boundary = `web-notes-${Date.now()}`;
    const body = `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify({ name, mimeType, parents: [parseDriveUri(parent).fileId] })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--\r\n`;
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,parents,modifiedTime,size', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    if (!response.ok) throw new GoogleDriveError('Image upload failed. Please try again.', response.status);
    return response.json() as Promise<DriveFile>;
  });
  const image = await rememberCreated(parent, path, file) as LocalImage;
  await mobileCache.put(`image:${image.uri}`, { content: `data:${mimeType};base64,${base64}`, modifiedTime: file.modifiedTime });
  return image;
}
export async function openLocalWeeklyNote(root: string, date = new Date()) {
  return openLocalWeeklyNoteCore(root, { listFolder: (parent, path) => listVaultFolder(root, parent, path), createFolder, createNote, readText: readNote, writeText: (uri, text) => saveNote(uri, '', text) }, date);
}
export async function readLocalWeeklyTemplate(root: string) {
  return readLocalWeeklyTemplateCore(root, { listFolder: (parent, path) => listVaultFolder(root, parent, path), readText: readNote });
}
