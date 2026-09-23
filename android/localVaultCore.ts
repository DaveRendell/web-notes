import { applyWeeklyNoteTemplate, getWeeklyNoteDetails } from '../web/src/lib/weeklyNote';

export type LocalNote = { kind: 'note'; uri: string; path: string; parentPath: string; name: string; size: number };
export type LocalImage = { kind: 'image'; uri: string; path: string; parentPath: string; name: string; size: number; mimeType: string };
export type LocalFolder = { kind: 'folder'; uri: string; path: string; parentPath: string; name: string };
export type LocalVaultItem = LocalNote | LocalImage | LocalFolder;
export type VaultListCache = { items: LocalVaultItem[]; complete: boolean };
export type VaultEntry = { uri: string; isDirectory: boolean; name?: string; mimeType?: string; size?: number };

const IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

export type VaultFiles = {
  readDirectory(uri: string): Promise<VaultEntry[]>;
  readText(uri: string): Promise<string>;
  writeText(uri: string, text: string): Promise<void>;
};

export type WeeklyVaultOperations = {
  listFolder(parentUri: string, parentPath: string): Promise<LocalVaultItem[]>;
  createFolder(parentUri: string, parentPath: string, name: string): Promise<LocalFolder>;
  createNote(parentUri: string, parentPath: string, name: string): Promise<LocalNote>;
  readText(uri: string): Promise<string>;
  writeText(uri: string, text: string): Promise<void>;
};

export type WeeklyTemplateOperations = Pick<WeeklyVaultOperations, 'listFolder' | 'readText'>;

export class ExternalNoteChangeError extends Error {
  constructor() {
    super('This note changed on the phone since you opened it. Your draft is still here; reload the note before saving.');
  }
}

export function displayNameFromSafUri(uri: string): string {
  const trimmed = uri.replace(/\/+$/, '');
  const documentId = decodeURIComponent(trimmed.slice(trimmed.lastIndexOf('/') + 1));
  return documentId.slice(Math.max(documentId.lastIndexOf('/'), documentId.lastIndexOf(':')) + 1);
}

export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = /^(---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$))/.exec(markdown);
  return match ? { frontmatter: match[0], body: markdown.slice(match[0].length) } : { frontmatter: '', body: markdown };
}

export async function listVaultFolderCore(
  folderUri: string,
  parentPath: string,
  files: VaultFiles,
): Promise<LocalVaultItem[]> {
  const children = await files.readDirectory(folderUri);
  const items: LocalVaultItem[] = [];
  for (const child of children) {
    const name = child.name ?? displayNameFromSafUri(child.uri);
    if (!name || name.startsWith('.')) continue;
    const path = parentPath ? `${parentPath}/${name}` : name;
    if (child.isDirectory) items.push({ kind: 'folder', uri: child.uri, path, parentPath, name });
    else if (/\.md$/i.test(name)) items.push({ kind: 'note', uri: child.uri, path, parentPath, name, size: child.size ?? 0 });
    else if (child.mimeType?.startsWith('image/') || IMAGE_EXTENSION_PATTERN.test(name)) {
      items.push({
        kind: 'image', uri: child.uri, path, parentPath, name,
        size: child.size ?? 0,
        mimeType: child.mimeType?.startsWith('image/') ? child.mimeType : imageMimeType(name),
      });
    }
  }
  return items;
}

export function replaceVaultFolderChildren(
  existing: LocalVaultItem[],
  parentPath: string,
  children: LocalVaultItem[],
): LocalVaultItem[] {
  const retainedFolderUris = new Map(children.filter((item): item is LocalFolder => item.kind === 'folder').map((item) => [item.path, item.uri]));
  const removedPaths = new Set(existing.filter((item) => item.parentPath === parentPath && item.kind === 'folder' && retainedFolderUris.get(item.path) !== item.uri).map((item) => item.path));
  const removedPrefixes = [...removedPaths].map((path) => `${path}/`);
  return [
    ...existing.filter((item) => item.parentPath !== parentPath && !removedPrefixes.some((prefix) => item.path.startsWith(prefix))),
    ...children,
  ];
}

export function parseVaultListCache(value: unknown, rootUri: string): VaultListCache | null {
  if (!value || typeof value !== 'object') return null;
  const cache = value as { version?: unknown; rootUri?: unknown; items?: unknown; complete?: unknown };
  if (cache.version !== 1 || cache.rootUri !== rootUri || !Array.isArray(cache.items)) return null;
  const valid = cache.items.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const entry = item as Record<string, unknown>;
    return (entry.kind === 'note' || entry.kind === 'image' || entry.kind === 'folder') &&
      typeof entry.uri === 'string' && typeof entry.path === 'string' &&
      typeof entry.parentPath === 'string' && typeof entry.name === 'string' &&
      (entry.kind === 'folder' || typeof entry.size === 'number') &&
      (entry.kind !== 'image' || typeof entry.mimeType === 'string');
  });
  return valid ? { items: cache.items as LocalVaultItem[], complete: cache.complete === true } : null;
}

function imageMimeType(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'svg') return 'image/svg+xml';
  return `image/${extension === 'avif' || extension === 'gif' || extension === 'png' || extension === 'webp' ? extension : 'png'}`;
}

export async function listVaultCore(
  rootUri: string,
  files: VaultFiles,
  onProgress?: (items: LocalVaultItem[], foldersScanned: number) => void,
): Promise<LocalVaultItem[]> {
  const items: LocalVaultItem[] = [];
  const folders = [{ uri: rootUri, path: '', depth: 0 }];
  let foldersScanned = 0;
  while (folders.length > 0) {
    const { uri: folderUri, path: parentPath, depth } = folders.shift()!;
    if (depth > 32) throw new Error('The selected vault has more than 32 folder levels.');
    const children = await listVaultFolderCore(folderUri, parentPath, files);
    for (const child of children) {
      items.push(child);
      if (child.kind === 'folder') folders.push({ uri: child.uri, path: child.path, depth: depth + 1 });
    }
    foldersScanned += 1;
    onProgress?.([...items], foldersScanned);
    // Allow the native list and progress status to render between folders.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return items.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
}

export async function saveNoteCore(uri: string, expectedOriginal: string, markdown: string, files: Pick<VaultFiles, 'readText' | 'writeText'>): Promise<void> {
  const current = await files.readText(uri);
  // A provider may commit a write before reporting an error (or a verification
  // read may fail). Retrying that same snapshot is already a successful save.
  if (current === markdown) return;
  if (current !== expectedOriginal) throw new ExternalNoteChangeError();
  await files.writeText(uri, markdown);
  if (await files.readText(uri) !== markdown) {
    throw new Error('The storage provider did not retain the saved note exactly. Check the synced file before editing further.');
  }
}

export async function openLocalWeeklyNoteCore(rootUri: string, operations: WeeklyVaultOperations, date = new Date()): Promise<LocalNote> {
  const details = getWeeklyNoteDetails(date);
  const findChild = async (parentUri: string, parentPath: string, name: string) => {
    const children = await operations.listFolder(parentUri, parentPath);
    return children.find((child) => child.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0) ?? null;
  };
  const findOrCreateFolder = async (parentUri: string, parentPath: string, name: string) => {
    const existing = await findChild(parentUri, parentPath, name);
    if (existing?.kind === 'folder') return existing;
    if (existing) throw new Error(`${existing.path} exists but is not a folder.`);
    return operations.createFolder(parentUri, parentPath, name);
  };

  const weeks = await findOrCreateFolder(rootUri, '', details.weeksFolderPath);
  const year = await findOrCreateFolder(weeks.uri, weeks.path, String(details.year));
  const existing = await findChild(year.uri, year.path, details.filename);
  if (existing?.kind === 'note') return existing;
  if (existing) throw new Error(`${details.path} exists but is not a note.`);

  const templateFolder = await findChild(rootUri, '', 'Templates');
  const template = templateFolder?.kind === 'folder'
    ? await findChild(templateFolder.uri, templateFolder.path, 'Week.md')
    : null;
  const templateText = template?.kind === 'note' ? await operations.readText(template.uri) : '';
  const note = await operations.createNote(year.uri, year.path, details.filename);
  await operations.writeText(note.uri, applyWeeklyNoteTemplate(templateText, details));
  return note;
}

export async function readLocalWeeklyTemplateCore(rootUri: string, operations: WeeklyTemplateOperations): Promise<string | null> {
  const rootItems = await operations.listFolder(rootUri, '');
  const templateFolder = rootItems.find((item) => item.kind === 'folder' && item.name.localeCompare('Templates', undefined, { sensitivity: 'base' }) === 0);
  if (!templateFolder || templateFolder.kind !== 'folder') return null;
  const templateItems = await operations.listFolder(templateFolder.uri, templateFolder.path);
  const template = templateItems.find((item) => item.kind === 'note' && item.name.localeCompare('Week.md', undefined, { sensitivity: 'base' }) === 0);
  return template?.kind === 'note' ? operations.readText(template.uri) : null;
}
