import * as FileSystem from 'expo-file-system/legacy';
import { Directory } from 'expo-file-system';
import { displayNameFromSafUri, listVaultCore, listVaultFolderCore, openLocalWeeklyNoteCore, parseVaultListCache, saveNoteCore, type LocalFolder, type LocalNote, type LocalVaultItem, type VaultFiles, type VaultListCache } from './localVaultCore';
import fastSaf from './modules/fast-saf';
import { parseFavouritePaths, parseNoteIconCache } from './vaultFeatures';

export { displayNameFromSafUri, splitFrontmatter, ExternalNoteChangeError, type LocalNote, type LocalFolder, type LocalVaultItem } from './localVaultCore';

const SAF = FileSystem.StorageAccessFramework;
const SAVED_VAULT_URI = `${FileSystem.documentDirectory}selected-vault-uri.txt`;
const VAULT_CACHE_URI = `${FileSystem.documentDirectory}vault-list-cache.json`;
const NOTE_ICON_CACHE_URI = `${FileSystem.documentDirectory}note-icon-cache.json`;
const files: Omit<VaultFiles, 'readDirectory'> = {
  readText: (uri) => SAF.readAsStringAsync(uri),
  writeText: (uri, text) => SAF.writeAsStringAsync(uri, text),
};

function vaultFiles(rootUri: string): VaultFiles {
  return {
    ...files,
    readDirectory: async (folderUri) => {
      if (fastSaf) {
        try { return await fastSaf.listChildren(rootUri, folderUri); }
        catch (cause) { console.warn('Fast directory listing failed; using Expo fallback:', cause); }
      }
      return new Directory(folderUri).list().map((entry) => ({ uri: entry.uri, isDirectory: entry instanceof Directory }));
    },
  };
}

export async function chooseVault(): Promise<string | null> {
  const permission = await SAF.requestDirectoryPermissionsAsync();
  if (!permission.granted) return null;
  await FileSystem.writeAsStringAsync(SAVED_VAULT_URI, permission.directoryUri);
  return permission.directoryUri;
}

export async function restoreVault(): Promise<string | null> {
  const info = await FileSystem.getInfoAsync(SAVED_VAULT_URI);
  if (!info.exists) return null;
  const uri = (await FileSystem.readAsStringAsync(SAVED_VAULT_URI)).trim();
  if (!uri) return null;
  return uri;
}

export async function listVault(rootUri: string, onProgress?: (items: LocalVaultItem[], foldersScanned: number) => void): Promise<LocalVaultItem[]> {
  return listVaultCore(rootUri, vaultFiles(rootUri), onProgress);
}

export async function listVaultFolder(rootUri: string, folderUri: string, parentPath: string): Promise<LocalVaultItem[]> {
  return listVaultFolderCore(folderUri, parentPath, vaultFiles(rootUri));
}

export async function readVaultListCache(rootUri: string): Promise<VaultListCache | null> {
  try {
    if (!(await FileSystem.getInfoAsync(VAULT_CACHE_URI)).exists) return null;
    return parseVaultListCache(JSON.parse(await FileSystem.readAsStringAsync(VAULT_CACHE_URI)) as unknown, rootUri);
  } catch (cause) {
    console.warn('Could not read the local vault listing cache:', cause);
    return null;
  }
}

export async function writeVaultListCache(rootUri: string, items: LocalVaultItem[], complete: boolean): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(VAULT_CACHE_URI, JSON.stringify({ version: 1, rootUri, items, complete }));
  } catch (cause) {
    console.warn('Could not write the local vault listing cache:', cause);
  }
}

export async function readVaultFavourites(rootUri: string): Promise<string[]> {
  const children = await vaultFiles(rootUri).readDirectory(rootUri);
  const settings = children.find((child) => !child.isDirectory && (child.name ?? displayNameFromSafUri(child.uri)) === '.web-notes.json');
  if (!settings) return [];
  return parseFavouritePaths(await files.readText(settings.uri));
}

export async function readNoteIconCache(rootUri: string): Promise<Record<string, string | null>> {
  try {
    if (!(await FileSystem.getInfoAsync(NOTE_ICON_CACHE_URI)).exists) return {};
    return parseNoteIconCache(JSON.parse(await FileSystem.readAsStringAsync(NOTE_ICON_CACHE_URI)) as unknown, rootUri) ?? {};
  } catch (cause) {
    console.warn('Could not read the note icon cache:', cause);
    return {};
  }
}

export async function writeNoteIconCache(rootUri: string, icons: Record<string, string | null>): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(NOTE_ICON_CACHE_URI, JSON.stringify({ version: 1, rootUri, icons }));
  } catch (cause) {
    console.warn('Could not write the note icon cache:', cause);
  }
}

export async function readNote(uri: string): Promise<string> {
  return files.readText(uri);
}

export async function saveNote(uri: string, expectedOriginal: string, markdown: string): Promise<void> {
  await saveNoteCore(uri, expectedOriginal, markdown, files);
}

function validateName(requestedName: string, stripMarkdownExtension: boolean): string {
  const base = stripMarkdownExtension ? requestedName.trim().replace(/\.md$/i, '') : requestedName.trim();
  if (!base || base.startsWith('.') || /[\\/]/.test(base) || [...base].some((character) => character.charCodeAt(0) < 32)) {
    throw new Error('Enter a name without a leading dot, slashes, or control characters.');
  }
  return base;
}

async function assertNameAvailable(parentUri: string, name: string): Promise<void> {
  const children = await SAF.readDirectoryAsync(parentUri);
  if (children.some((uri) => displayNameFromSafUri(uri).toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error('An item with that name already exists in this folder.');
  }
}

export async function createNote(parentUri: string, parentPath: string, requestedName: string): Promise<LocalNote> {
  const base = validateName(requestedName, true);
  const name = `${base}.md`;
  await assertNameAvailable(parentUri, name);
  const uri = await SAF.createFileAsync(parentUri, base, 'text/markdown');
  await SAF.writeAsStringAsync(uri, '');
  const createdName = displayNameFromSafUri(uri);
  return { kind: 'note', uri, path: parentPath ? `${parentPath}/${createdName}` : createdName, parentPath, name: createdName, size: 0 };
}

export async function createFolder(parentUri: string, parentPath: string, requestedName: string): Promise<LocalFolder> {
  const name = validateName(requestedName, false);
  await assertNameAvailable(parentUri, name);
  const uri = await SAF.makeDirectoryAsync(parentUri, name);
  const createdName = displayNameFromSafUri(uri);
  return { kind: 'folder', uri, path: parentPath ? `${parentPath}/${createdName}` : createdName, parentPath, name: createdName };
}

export async function openLocalWeeklyNote(rootUri: string, date = new Date()): Promise<LocalNote> {
  return openLocalWeeklyNoteCore(rootUri, {
    listFolder: (parentUri, parentPath) => listVaultFolder(rootUri, parentUri, parentPath),
    createFolder,
    createNote,
    readText: readNote,
    writeText: files.writeText,
  }, date);
}
