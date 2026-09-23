import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useVaultTree } from '../hooks/useVaultTree';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useVaultFavorites } from '../hooks/useVaultFavorites';
import {
  createDriveFolder,
  createDriveTextFile,
  getDriveFileText,
  uploadDriveImage,
  createDriveMarkdownFile,
  isGoogleDriveAuthError,
  deleteDriveFile,
  moveDriveFile,
  renameDriveFolder,
  renameDriveItem,
  renameDriveFile,
} from '../lib/googleDrive';
import {
  deleteNoteContent,
  getNoteContent,
  getNoteIcons,
  putNoteContent,
  putNoteIcon,
  updateNoteContentVersion,
} from '../lib/vaultCache';
import { findLeadingEmoji } from '../lib/markdown';
import { updatePageFavicon } from '../lib/pageFavicon';
import { applyWeeklyNoteTemplate, getWeeklyNoteDetails } from '../lib/weeklyNote';
import {
  containsVaultNode,
  createVaultNode,
  findVaultNode,
  findVaultNodeParentId,
  sortVaultNodes,
} from '../lib/vaultTree';
import { readMigratedStorage, removeMigratedStorage, safeLocalStorage as localStorage } from '../lib/browserStorage';
import { DriveFile } from '../types/drive';
import { VaultNode } from '../types/vault';
import { useAuth } from './AuthContext';

const SELECTED_VAULT_KEY = 'web-notes:selected-vault';
const LEGACY_SELECTED_VAULT_KEY = 'vault-web-viewer:selected-vault';
const RECENT_NOTES_KEY = 'web-notes:recent-notes';
const LEGACY_RECENT_NOTES_KEY = 'vault-web-viewer:recent-notes';
const MAX_RECENT_NOTES = 25;

type StoredVault = {
  id: string;
  name: string;
};

type VaultContextValue = {
  renameImage: (image: VaultNode, name: string) => Promise<void>;
  deleteImage: (image: VaultNode) => Promise<void>;
  uploadImage: (file: File) => Promise<VaultNode>;
  cacheNoteIcon: (fileId: string, content: string) => void;
  clearVault: () => void;
  createFolder: (parentFolder: VaultNode | null, name: string) => Promise<VaultNode>;
  createNote: (parentFolder: VaultNode | null, name: string) => Promise<VaultNode>;
  deleteFolder: (folder: VaultNode) => Promise<void>;
  deleteNote: (note: VaultNode) => Promise<void>;
  error: string | null;
  favoriteNotes: VaultNode[];
  favoriteNoteIds: string[];
  favoriteSyncError: string | null;
  isLoading: boolean;
  isOnline: boolean;
  isRefreshing: boolean;
  moveNode: (node: VaultNode, destinationFolder: VaultNode | null) => Promise<VaultNode>;
  openFileInTab: (file: VaultNode) => void;
  openFiles: VaultNode[];
  activateFileTab: (fileId: string) => void;
  closeFileTab: (fileId: string) => void;
  openWeeklyNote: (date?: Date) => Promise<VaultNode>;
  noteIcons: Record<string, string | null>;
  notes: VaultNode[];
  recentNotes: VaultNode[];
  reorderFileTab: (fileId: string, targetFileId: string, placement: 'before' | 'after') => void;
  reorderFavorite: (noteId: string, targetNoteId: string, placement: 'before' | 'after') => void;
  refreshError: string | null;
  renameFolder: (folder: VaultNode, name: string) => Promise<VaultNode>;
  renameNote: (note: VaultNode, name: string) => Promise<VaultNode>;
  resolveWikilink: (target: string) => VaultNode | null;
  selectFile: (file: VaultNode) => void;
  selectVault: (folder: Pick<DriveFile, 'id' | 'name'>) => void;
  selectedFile: VaultNode | null;
  selectedVault: StoredVault | null;
  storeSavedNote: (note: VaultNode, file: DriveFile, content?: string) => void;
  toggleFavorite: (noteId: string) => void;
  tree: VaultNode[];
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { accessToken, accountId, ensureAccessToken, invalidateAccessToken, isAccountResolved } = useAuth();
  const [selectedVault, setSelectedVault] = useState<StoredVault | null>(() => readStoredVault());
  const [selectedFile, setSelectedFile] = useState<VaultNode | null>(null);
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const openFileIdsRef = useRef(openFileIds);
  const selectedFileRef = useRef(selectedFile);
  openFileIdsRef.current = openFileIds;
  selectedFileRef.current = selectedFile;
  const [recentNoteIds, setRecentNoteIds] = useState<string[]>(() => readRecentNoteIds(selectedVault?.id ?? null));
  const [routePath, setRoutePath] = useState(() => getNotePathFromHash());
  const [noteIcons, setNoteIcons] = useState<Record<string, string | null>>({});
  const isOnline = useOnlineStatus();
  const imageUploadScope = `${accountId}:${selectedVault?.id}`;
  const imageUploadScopeRef = useRef(imageUploadScope);
  imageUploadScopeRef.current = imageUploadScope;
  const { error, isLoading, isRefreshing, refreshError, setTree, tree } = useVaultTree(
    accessToken,
    accountId,
    isAccountResolved,
    selectedVault?.id ?? null,
    selectedVault?.name ?? null,
  );
  const notes = useMemo(() => flattenVaultTree(tree).filter((node) => node.type === 'markdown'), [tree]);
  const notePathsById = useMemo(() => new Map(notes.map((note) => [note.id, note.path])), [notes]);
  const {
    favoriteNoteIds,
    favoriteSyncError,
    removeFavorites,
    reorderFavorite,
    toggleFavorite,
  } = useVaultFavorites({
    canSync: Boolean(accessToken),
    ensureAccessToken,
    invalidateAccessToken,
    isOnline,
    notePathsById,
    vaultId: selectedVault?.id ?? null,
  });
  const recentNotes = useMemo(() => {
    const notesById = new Map(notes.map((note) => [note.id, note]));
    return recentNoteIds.flatMap((id) => {
      const note = notesById.get(id);
      return note ? [note] : [];
    });
  }, [notes, recentNoteIds]);
  const favoriteNotes = useMemo(() => {
    const notesById = new Map(notes.map((note) => [note.id, note]));
    return favoriteNoteIds.flatMap((id) => {
      const note = notesById.get(id);
      return note ? [note] : [];
    });
  }, [favoriteNoteIds, notes]);
  const vaultIndex = useMemo(() => createVaultIndex(tree), [tree]);
  const openFiles = useMemo(
    () => openFileIds.flatMap((id) => {
      const file = vaultIndex.byId.get(id);
      return file && file.type !== 'folder' && file.type !== 'other' ? [file] : [];
    }),
    [openFileIds, vaultIndex],
  );

  const updateOpenFileIds = useCallback((nextIds: string[]) => {
    openFileIdsRef.current = nextIds;
    setOpenFileIds(nextIds);
  }, []);

  const activateFile = useCallback((file: VaultNode, replaceHistory = false) => {
    selectedFileRef.current = file;
    setSelectedFile(file);
    setRoutePath(file.path);
    if (replaceHistory) replaceNoteHash(file.path);
    else setNoteHash(file.path);
  }, []);

  const selectVault = useCallback((folder: Pick<DriveFile, 'id' | 'name'>) => {
    const vault = { id: folder.id, name: folder.name };
    localStorage.setItem(SELECTED_VAULT_KEY, JSON.stringify(vault));
    setSelectedVault(vault);
    setSelectedFile(null);
    selectedFileRef.current = null;
    updateOpenFileIds([]);
    setRecentNoteIds(readRecentNoteIds(vault.id));
    setRoutePath(null);
    clearNoteHash();
  }, [updateOpenFileIds]);

  const clearVault = useCallback(() => {
    removeMigratedStorage(localStorage, SELECTED_VAULT_KEY, LEGACY_SELECTED_VAULT_KEY);
    setSelectedVault(null);
    setSelectedFile(null);
    selectedFileRef.current = null;
    updateOpenFileIds([]);
    setRecentNoteIds([]);
    setRoutePath(null);
    clearNoteHash();
  }, [updateOpenFileIds]);

  const cacheNoteIcon = useCallback(
    (fileId: string, content: string) => {
      if (!accountId || !selectedVault) return;

      const emoji = findLeadingEmoji(content);
      setNoteIcons((currentIcons) => {
        if (Object.hasOwn(currentIcons, fileId) && currentIcons[fileId] === emoji) return currentIcons;
        return { ...currentIcons, [fileId]: emoji };
      });
      void putNoteIcon({
        accountId,
        vaultId: selectedVault.id,
        fileId,
        emoji,
        cachedAt: Date.now(),
      });
    },
    [accountId, selectedVault],
  );

  const selectFile = useCallback((file: VaultNode) => {
    if (file.type === 'folder' || file.type === 'other') return;
    const currentIds = openFileIdsRef.current;
    if (!currentIds.includes(file.id)) {
      const activeIndex = currentIds.indexOf(selectedFileRef.current?.id ?? '');
      const nextIds = activeIndex === -1
        ? [...currentIds, file.id]
        : currentIds.map((id, index) => index === activeIndex ? file.id : id);
      updateOpenFileIds(nextIds);
    }
    activateFile(file);
  }, [activateFile, updateOpenFileIds]);

  const openFileInTab = useCallback((file: VaultNode) => {
    if (file.type === 'folder' || file.type === 'other') return;
    if (!openFileIdsRef.current.includes(file.id)) {
      updateOpenFileIds([...openFileIdsRef.current, file.id]);
    }
    if (!selectedFileRef.current) activateFile(file);
  }, [activateFile, updateOpenFileIds]);

  const activateFileTab = useCallback((fileId: string) => {
    const file = vaultIndex.byId.get(fileId);
    if (!file || file.type === 'folder' || file.type === 'other') return;
    activateFile(file);
  }, [activateFile, vaultIndex]);

  const closeFileTabs = useCallback((fileIds: ReadonlySet<string>) => {
    const currentIds = openFileIdsRef.current;
    const nextIds = currentIds.filter((id) => !fileIds.has(id));
    if (nextIds.length !== currentIds.length) updateOpenFileIds(nextIds);

    const activeId = selectedFileRef.current?.id;
    if (!activeId || !fileIds.has(activeId)) return;
    const closedIndex = currentIds.indexOf(activeId);
    const nextActiveId = closedIndex === -1
      ? nextIds[0]
      : currentIds.slice(closedIndex + 1).find((id) => !fileIds.has(id))
        ?? currentIds.slice(0, closedIndex).reverse().find((id) => !fileIds.has(id));
    const nextFile = nextActiveId ? vaultIndex.byId.get(nextActiveId) : null;
    if (nextFile && nextFile.type !== 'folder' && nextFile.type !== 'other') {
      activateFile(nextFile, true);
    } else {
      selectedFileRef.current = null;
      setSelectedFile(null);
      setRoutePath(null);
      clearNoteHash(true);
    }
  }, [activateFile, updateOpenFileIds, vaultIndex]);

  const closeFileTab = useCallback((fileId: string) => {
    closeFileTabs(new Set([fileId]));
  }, [closeFileTabs]);

  const reorderFileTab = useCallback((fileId: string, targetFileId: string, placement: 'before' | 'after') => {
    const currentIds = openFileIdsRef.current;
    if (fileId === targetFileId || !currentIds.includes(fileId) || !currentIds.includes(targetFileId)) return;
    const nextIds = currentIds.filter((id) => id !== fileId);
    const targetIndex = nextIds.indexOf(targetFileId);
    nextIds.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, fileId);
    updateOpenFileIds(nextIds);
  }, [updateOpenFileIds]);

  const resolveWikilink = useCallback(
    (target: string) => {
      const normalizedTarget = normalizeWikilinkTarget(target);
      return vaultIndex.byPath.get(normalizedTarget) ?? vaultIndex.byName.get(normalizedTarget) ?? null;
    },
    [vaultIndex],
  );

  const createNote = useCallback(
    async (parentFolder: VaultNode | null, name: string) => {
      if (!accessToken || !selectedVault) {
        throw new Error('Sign in and choose a vault before creating notes.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before creating a note.');

      const parentFolderId = parentFolder?.id ?? selectedVault.id;
      const parentPath = parentFolder?.path ?? '';
      const validAccessToken = await ensureAccessToken();
      const file = await createDriveMarkdownFile(validAccessToken, parentFolderId, name);
      const node = createVaultNode(file, parentPath);

      setTree((currentTree) => addNodeToTree(currentTree, parentFolder?.id ?? null, node));
      if (accountId) {
        void putNoteContent({
          accountId,
          vaultId: selectedVault.id,
          fileId: node.id,
          content: '',
          modifiedTime: file.modifiedTime,
          cachedAt: Date.now(),
        });
      }
      selectFile(node);
      return node;
    },
    [accessToken, accountId, ensureAccessToken, isOnline, selectFile, selectedVault, setTree],
  );

  const uploadImage = useCallback(async (image: File) => {
    if (!selectedVault || !isOnline) throw new Error('Connect to Drive before uploading an image.');
    const parentId = selectedFile ? findVaultNodeParentId(tree, selectedFile.id) : null;
    const parent = parentId ? findVaultNode(tree, parentId) : null;
    const siblings = parent?.children ?? tree;
    let name = image.name;
    let suffix = 2;
    const dot = image.name.lastIndexOf('.');
    const stem = dot > 0 ? image.name.slice(0, dot) : image.name;
    const extension = dot > 0 ? image.name.slice(dot) : '';
    while (siblings.some((node) => node.name === name)) name = `${stem} (${suffix++})${extension}`;
    const upload = new File([image], name, { type: image.type });
    let file: DriveFile;
    try { file = await uploadDriveImage(await ensureAccessToken(), parentId ?? selectedVault.id, upload); }
    catch (error) {
      if (!isGoogleDriveAuthError(error)) throw error;
      invalidateAccessToken();
      file = await uploadDriveImage(await ensureAccessToken(), parentId ?? selectedVault.id, upload);
    }
    if (imageUploadScopeRef.current !== imageUploadScope) throw new Error('Image uploaded to the previous vault. Reopen that vault to see it.');
    const node = createVaultNode(file, parent?.path ?? '');
    setTree((current) => addNodeToTree(current, parentId, node));
    return node;
  }, [ensureAccessToken, imageUploadScope, invalidateAccessToken, isOnline, selectedFile, selectedVault, setTree, tree]);

  const createFolder = useCallback(
    async (parentFolder: VaultNode | null, name: string) => {
      if (!accessToken || !selectedVault) {
        throw new Error('Sign in and choose a vault before creating folders.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before creating a folder.');
      if (parentFolder && parentFolder.type !== 'folder') {
        throw new Error('Folders can only be created inside another folder or at the vault root.');
      }

      const parentFolderId = parentFolder?.id ?? selectedVault.id;
      const parentPath = parentFolder?.path ?? '';
      const validAccessToken = await ensureAccessToken();
      const file = await createDriveFolder(validAccessToken, parentFolderId, name);
      const node = createVaultNode(file, parentPath);

      setTree((currentTree) => addNodeToTree(currentTree, parentFolder?.id ?? null, node));
      return node;
    },
    [accessToken, ensureAccessToken, isOnline, selectedVault, setTree],
  );

  const openWeeklyNote = useCallback(async (date = new Date()) => {
    if (!accessToken || !selectedVault) {
      throw new Error('Sign in and choose a vault before opening a weekly note.');
    }

    const details = getWeeklyNoteDetails(date);
    const existingNote = findVaultNodeByPath(tree, details.path);
    if (existingNote) {
      if (existingNote.type !== 'markdown') throw new Error(`A non-note file already exists at ${details.path}.`);
      selectFile(existingNote);
      return existingNote;
    }
    if (!isOnline) throw new Error('Reconnect to the internet before creating this week’s note.');

    async function driveRequest<T>(request: (token: string) => Promise<T>) {
      try {
        return await request(await ensureAccessToken());
      } catch (requestError) {
        if (!isGoogleDriveAuthError(requestError)) throw requestError;
        invalidateAccessToken();
        return request(await ensureAccessToken());
      }
    }

    const templateNote = findVaultNodeByPath(tree, 'Templates/Week.md');
    let template = '';
    if (templateNote?.type === 'markdown') {
      const cachedTemplate = accountId
        ? await getNoteContent(accountId, selectedVault.id, templateNote.id)
        : null;
      const cacheIsCurrent = Boolean(
        cachedTemplate?.modifiedTime
        && templateNote.source.modifiedTime
        && cachedTemplate.modifiedTime === templateNote.source.modifiedTime,
      );
      template = cacheIsCurrent
        ? cachedTemplate!.content
        : await driveRequest((token) => getDriveFileText(token, templateNote.id));
    }
    // Expand the raw template before the rich-text parser interprets HTML comments,
    // allowing date variables to be used inside calendar widget configuration.
    const content = applyWeeklyNoteTemplate(template, details);

    let weeksFolder = findVaultNodeByPath(tree, details.weeksFolderPath);
    if (weeksFolder && weeksFolder.type !== 'folder') {
      throw new Error(`A non-folder file already exists at ${details.weeksFolderPath}.`);
    }
    if (!weeksFolder) {
      const file = await driveRequest((token) => createDriveFolder(token, selectedVault.id, 'Weeks'));
      weeksFolder = createVaultNode(file, '');
      setTree((currentTree) => addNodeToTree(currentTree, null, weeksFolder!));
    }

    let yearFolder = findVaultNodeByPath(tree, details.yearFolderPath);
    if (yearFolder && yearFolder.type !== 'folder') {
      throw new Error(`A non-folder file already exists at ${details.yearFolderPath}.`);
    }
    if (!yearFolder) {
      const file = await driveRequest((token) => createDriveFolder(token, weeksFolder!.id, String(details.year)));
      yearFolder = createVaultNode(file, weeksFolder.path);
      setTree((currentTree) => addNodeToTree(currentTree, weeksFolder!.id, yearFolder!));
    }

    const file = await driveRequest((token) => createDriveTextFile(
      token,
      yearFolder!.id,
      details.filename,
      content,
      'text/markdown',
    ));
    const note = createVaultNode(file, yearFolder.path);
    setTree((currentTree) => addNodeToTree(currentTree, yearFolder!.id, note));
    if (accountId) {
      void putNoteContent({
        accountId,
        vaultId: selectedVault.id,
        fileId: note.id,
        content,
        modifiedTime: file.modifiedTime,
        cachedAt: Date.now(),
      });
    }
    cacheNoteIcon(note.id, content);
    selectFile(note);
    return note;
  }, [accessToken, accountId, cacheNoteIcon, ensureAccessToken, invalidateAccessToken, isOnline, selectFile, selectedVault, setTree, tree]);

  const renameNote = useCallback(
    async (note: VaultNode, name: string) => {
      if (!accessToken) {
        throw new Error('Sign in before renaming notes.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before renaming a note.');

      const validAccessToken = await ensureAccessToken();
      const file = await renameDriveFile(validAccessToken, note.id, name);
      const parentPath = getParentPath(note.path);
      const updatedNote = createVaultNode(file, parentPath);

      setTree((currentTree) => replaceNodeInTree(currentTree, updatedNote));
      if (accountId && selectedVault) {
        void updateNoteContentVersion(accountId, selectedVault.id, note.id, file.modifiedTime);
      }

      if (selectedFile?.id === note.id) {
        selectFile(updatedNote);
      }

      return updatedNote;
    },
    [accessToken, accountId, ensureAccessToken, isOnline, selectFile, selectedFile?.id, selectedVault, setTree],
  );

  const renameImage = useCallback(async (image: VaultNode, name: string) => {
    if (!accessToken || !isOnline) throw new Error('Reconnect to Drive before renaming an image.');
    const current = findVaultNode(tree, image.id);
    if (current?.type !== 'image') throw new Error('This image is no longer in the vault.');
    const trimmed = name.trim();
    if (!trimmed || trimmed.startsWith('.') || /[/\\]/.test(trimmed)) throw new Error('Enter a filename without slashes or a leading dot.');
    const extension = current.name.match(/\.[^.]+$/)?.[0] ?? '';
    const filename = extension && !trimmed.toLowerCase().endsWith(extension.toLowerCase()) ? `${trimmed}${extension}` : trimmed;
    // The generic metadata rename preserves image extensions (the note helper adds .md).
    const file = await renameDriveItem(await ensureAccessToken(), current.id, filename);
    if (imageUploadScopeRef.current !== imageUploadScope) return;
    setTree((nodes) => {
      const live = findVaultNode(nodes, current.id);
      return live ? replaceNodeInTree(nodes, createVaultNode(file, getParentPath(live.path))) : nodes;
    });
  }, [accessToken, ensureAccessToken, imageUploadScope, isOnline, setTree, tree]);

  const deleteImage = useCallback(async (image: VaultNode) => {
    if (!accessToken || !isOnline) throw new Error('Reconnect to Drive before deleting an image.');
    if (findVaultNode(tree, image.id)?.type !== 'image') throw new Error('This image is no longer in the vault.');
    await deleteDriveFile(await ensureAccessToken(), image.id);
    if (imageUploadScopeRef.current !== imageUploadScope) return;
    setTree((nodes) => removeNodeFromTree(nodes, image.id));
    closeFileTab(image.id);
  }, [accessToken, closeFileTab, ensureAccessToken, imageUploadScope, isOnline, setTree, tree]);

  const renameFolder = useCallback(
    async (folder: VaultNode, name: string) => {
      if (!accessToken) throw new Error('Sign in before renaming folders.');
      if (!isOnline) throw new Error('Reconnect to the internet before renaming a folder.');
      if (folder.type !== 'folder') throw new Error('Only folders can be renamed with this action.');

      const currentFolder = findVaultNode(tree, folder.id);
      if (currentFolder?.type !== 'folder') throw new Error('This folder is no longer in the current vault.');

      const validAccessToken = await ensureAccessToken();
      const file = await renameDriveFolder(validAccessToken, currentFolder.id, name);
      const updatedFolder = rebaseMovedNode(currentFolder, file, getParentPath(currentFolder.path));
      setTree((currentTree) => replaceNodeInTree(currentTree, updatedFolder));
      return updatedFolder;
    },
    [accessToken, ensureAccessToken, isOnline, setTree, tree],
  );

  const deleteNote = useCallback(
    async (note: VaultNode) => {
      if (!accessToken) {
        throw new Error('Sign in before deleting notes.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before deleting a note.');

      const validAccessToken = await ensureAccessToken();
      await deleteDriveFile(validAccessToken, note.id);
      setTree((currentTree) => removeNodeFromTree(currentTree, note.id));
      if (accountId && selectedVault) {
        void deleteNoteContent(accountId, selectedVault.id, note.id);
      }
      setRecentNoteIds((currentIds) => {
        const nextIds = currentIds.filter((id) => id !== note.id);
        writeRecentNoteIds(selectedVault?.id ?? null, nextIds);
        return nextIds;
      });
      removeFavorites(new Set([note.id]));
      setNoteIcons((currentIcons) => {
        const nextIcons = { ...currentIcons };
        delete nextIcons[note.id];
        return nextIcons;
      });

      closeFileTab(note.id);
    },
    [accessToken, accountId, closeFileTab, ensureAccessToken, isOnline, removeFavorites, selectedVault, setTree],
  );

  const deleteFolder = useCallback(
    async (folder: VaultNode) => {
      if (!accessToken) throw new Error('Sign in before deleting folders.');
      if (!isOnline) throw new Error('Reconnect to the internet before deleting a folder.');

      const currentFolder = findVaultNode(tree, folder.id);
      if (currentFolder?.type !== 'folder') throw new Error('This folder is no longer in the current vault.');

      const removedFiles = flattenVaultTree([currentFolder]).filter((node) => node.type === 'markdown' || node.type === 'image');
      const removedFileIds = new Set(removedFiles.map((node) => node.id));
      const removedNoteIds = new Set(removedFiles.filter((node) => node.type === 'markdown').map((node) => node.id));
      const validAccessToken = await ensureAccessToken();
      await deleteDriveFile(validAccessToken, currentFolder.id);
      setTree((currentTree) => removeNodeFromTree(currentTree, currentFolder.id));

      if (accountId && selectedVault) {
        for (const noteId of removedNoteIds) {
          void deleteNoteContent(accountId, selectedVault.id, noteId);
        }
      }
      setRecentNoteIds((currentIds) => {
        const nextIds = currentIds.filter((id) => !removedNoteIds.has(id));
        writeRecentNoteIds(selectedVault?.id ?? null, nextIds);
        return nextIds;
      });
      removeFavorites(removedNoteIds);
      setNoteIcons((currentIcons) => {
        const nextIcons = { ...currentIcons };
        for (const noteId of removedNoteIds) delete nextIcons[noteId];
        return nextIcons;
      });

      closeFileTabs(removedFileIds);
    },
    [accessToken, accountId, closeFileTabs, ensureAccessToken, isOnline, removeFavorites, selectedVault, setTree, tree],
  );

  const moveNode = useCallback(
    async (node: VaultNode, destinationFolder: VaultNode | null) => {
      if (!accessToken || !selectedVault) {
        throw new Error('Sign in and choose a vault before moving files.');
      }
      if (!isOnline) throw new Error('Reconnect to the internet before moving a file.');
      if (node.type !== 'markdown' && node.type !== 'folder') {
        throw new Error('Only notes and folders can be moved.');
      }

      const currentNode = findVaultNode(tree, node.id);
      if (!currentNode) throw new Error('This file is no longer in the current vault.');
      if (currentNode.type !== 'markdown' && currentNode.type !== 'folder') {
        throw new Error('Only notes and folders can be moved.');
      }

      const currentDestination = destinationFolder ? findVaultNode(tree, destinationFolder.id) : null;
      if (destinationFolder && currentDestination?.type !== 'folder') {
        throw new Error('Files can only be moved into folders or the vault root.');
      }
      if (currentDestination?.id === currentNode.id) {
        throw new Error('A folder cannot be moved into itself.');
      }
      if (currentNode.type === 'folder' && currentDestination && containsVaultNode(currentNode, currentDestination.id)) {
        throw new Error('A folder cannot be moved into one of its descendants.');
      }

      const currentParentId = findVaultNodeParentId(tree, currentNode.id);
      const destinationParentId = currentDestination?.id ?? null;
      if (currentParentId === destinationParentId) {
        return currentNode;
      }

      const oldDriveParentId = currentParentId ?? selectedVault.id;
      const newDriveParentId = destinationParentId ?? selectedVault.id;
      const currentParentPath = currentParentId ? findVaultNode(tree, currentParentId)?.path ?? '' : '';
      const destinationPath = currentDestination?.path ?? '';
      const optimisticFile = { ...currentNode.source, parents: [newDriveParentId] };
      setTree((currentTree) =>
        addNodeToTree(
          removeNodeFromTree(currentTree, currentNode.id),
          destinationParentId,
          rebaseMovedNode(findVaultNode(currentTree, currentNode.id) ?? currentNode, optimisticFile, destinationPath),
        ),
      );

      try {
        const validAccessToken = await ensureAccessToken();
        const file = await moveDriveFile(
          validAccessToken,
          currentNode.id,
          oldDriveParentId,
          newDriveParentId,
        );
        const movedNode = rebaseMovedNode(currentNode, file, destinationPath);

        setTree((currentTree) => {
          const liveNode = findVaultNode(currentTree, currentNode.id);
          return liveNode ? replaceNodeInTree(currentTree, rebaseMovedNode(liveNode, file, destinationPath)) : currentTree;
        });
        if (currentNode.type === 'markdown' && accountId) {
          void updateNoteContentVersion(accountId, selectedVault.id, currentNode.id, file.modifiedTime);
        }

        return movedNode;
      } catch (requestError) {
        setTree((currentTree) => {
          const liveNode = findVaultNode(currentTree, currentNode.id);
          if (!liveNode) return currentTree;

          const restoredFile = {
            ...liveNode.source,
            parents: currentNode.source.parents ?? [oldDriveParentId],
          };
          const restoredNode = rebaseMovedNode(liveNode, restoredFile, currentParentPath);
          return addNodeToTree(removeNodeFromTree(currentTree, currentNode.id), currentParentId, restoredNode);
        });
        throw requestError;
      }
    },
    [accessToken, accountId, ensureAccessToken, isOnline, selectedVault, setTree, tree],
  );

  const storeSavedNote = useCallback(
    (note: VaultNode, file: DriveFile, nextContent?: string) => {
      const updatedNote = createVaultNode(file, getParentPath(note.path));
      setTree((currentTree) => replaceNodeInTree(currentTree, updatedNote));

      setSelectedFile((currentFile) => currentFile?.id === note.id ? updatedNote : currentFile);

      if (accountId && selectedVault && nextContent !== undefined) {
        void putNoteContent({
          accountId,
          vaultId: selectedVault.id,
          fileId: note.id,
          content: nextContent,
          modifiedTime: file.modifiedTime,
          cachedAt: Date.now(),
        });
      }
    },
    [accountId, selectedVault, setTree],
  );

  useEffect(() => {
    let cancelled = false;
    setNoteIcons({});

    if (accountId && selectedVault) {
      void getNoteIcons(accountId, selectedVault.id).then((records) => {
        if (cancelled) return;

        const cachedIcons = Object.fromEntries(records.map((record) => [record.fileId, record.emoji]));
        setNoteIcons((currentIcons) => ({ ...cachedIcons, ...currentIcons }));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [accountId, selectedVault]);

  useEffect(() => {
    const templateNote = vaultIndex.byPath.get('Templates/Week.md');
    if (
      !accountId
      || !selectedVault
      || templateNote?.type !== 'markdown'
      || Object.hasOwn(noteIcons, templateNote.id)
    ) return;

    let cancelled = false;
    void (async () => {
      try {
        const cached = await getNoteContent(accountId, selectedVault.id, templateNote.id);
        const cacheIsCurrent = Boolean(
          cached?.modifiedTime
          && templateNote.source.modifiedTime
          && cached.modifiedTime === templateNote.source.modifiedTime,
        );
        let content = cached?.content ?? '';
        if (!cacheIsCurrent && isOnline) {
          try {
            content = await getDriveFileText(await ensureAccessToken(), templateNote.id);
          } catch (requestError) {
            if (!isGoogleDriveAuthError(requestError)) throw requestError;
            invalidateAccessToken();
            content = await getDriveFileText(await ensureAccessToken(), templateNote.id);
          }
          void putNoteContent({
            accountId,
            vaultId: selectedVault.id,
            fileId: templateNote.id,
            content,
            modifiedTime: templateNote.source.modifiedTime,
            cachedAt: Date.now(),
          });
        }
        if (!cancelled && (cached || cacheIsCurrent || isOnline)) cacheNoteIcon(templateNote.id, content);
      } catch (previewError) {
        console.warn('Could not load the weekly note template icon:', previewError);
      }
    })();

    return () => { cancelled = true; };
  }, [accountId, cacheNoteIcon, ensureAccessToken, invalidateAccessToken, isOnline, noteIcons, selectedVault, vaultIndex]);

  useEffect(() => {
    if (!selectedVault || selectedFile?.type !== 'markdown') return;

    setRecentNoteIds((currentIds) => {
      if (currentIds[0] === selectedFile.id) return currentIds;

      const nextIds = [selectedFile.id, ...currentIds.filter((id) => id !== selectedFile.id)].slice(
        0,
        MAX_RECENT_NOTES,
      );
      writeRecentNoteIds(selectedVault.id, nextIds);
      return nextIds;
    });
  }, [selectedFile, selectedVault]);

  useEffect(() => {
    if (!routePath) {
      if (selectedFile) {
        setSelectedFile(null);
      }
      return;
    }

    const normalizedRoutePath = normalizeWikilinkTarget(routePath);
    const routedNote = vaultIndex.byPath.get(normalizedRoutePath);
    const selectedNote = selectedFile ? vaultIndex.byId.get(selectedFile.id) : null;
    const currentNote = routedNote ?? (
      selectedFile && normalizeWikilinkTarget(selectedFile.path) === normalizedRoutePath
        ? selectedNote
        : null
    );

    if (!currentNote) {
      if (selectedFile && !isLoading && !isRefreshing) {
        closeFileTab(selectedFile.id);
      }
      return;
    }

    if (currentNote === selectedFile) return;

    const currentIds = openFileIdsRef.current;
    if (!currentIds.includes(currentNote.id)) {
      const activeIndex = currentIds.indexOf(selectedFileRef.current?.id ?? '');
      updateOpenFileIds(activeIndex === -1
        ? [...currentIds, currentNote.id]
        : currentIds.map((id, index) => index === activeIndex ? currentNote.id : id));
    }
    selectedFileRef.current = currentNote;
    setSelectedFile(currentNote);
    if (currentNote.path !== routePath) {
      setRoutePath(currentNote.path);
      replaceNoteHash(currentNote.path);
    }
  }, [closeFileTab, isLoading, isRefreshing, routePath, selectedFile, updateOpenFileIds, vaultIndex]);

  useEffect(() => {
    function handleHashChange() {
      setRoutePath(getNotePathFromHash());
    }

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  useEffect(() => {
    document.title = selectedFile ? stripMarkdownExtension(selectedFile.name) : 'Web Notes';
    updatePageFavicon(selectedFile ? noteIcons[selectedFile.id] : null);
  }, [noteIcons, selectedFile]);

  const value = useMemo(
    () => ({
      renameImage,
      deleteImage,
      uploadImage,
      cacheNoteIcon,
      clearVault,
      createFolder,
      createNote,
      deleteFolder,
      deleteNote,
      error,
      favoriteNoteIds,
      favoriteNotes,
      favoriteSyncError,
      isLoading,
      isOnline,
      isRefreshing,
      moveNode,
      openFileInTab,
      openFiles,
      activateFileTab,
      closeFileTab,
      openWeeklyNote,
      noteIcons,
      notes,
      recentNotes,
      reorderFileTab,
      reorderFavorite,
      refreshError,
      renameFolder,
      renameNote,
      resolveWikilink,
      selectFile,
      selectVault,
      selectedFile,
      selectedVault,
      storeSavedNote,
      toggleFavorite,
      tree,
    }),
    [
      renameImage,
      deleteImage,
      uploadImage,
      clearVault,
      cacheNoteIcon,
      createFolder,
      createNote,
      deleteFolder,
      deleteNote,
      error,
      favoriteNoteIds,
      favoriteNotes,
      favoriteSyncError,
      isLoading,
      isOnline,
      isRefreshing,
      moveNode,
      openFileInTab,
      openFiles,
      activateFileTab,
      closeFileTab,
      openWeeklyNote,
      noteIcons,
      notes,
      recentNotes,
      reorderFileTab,
      reorderFavorite,
      refreshError,
      renameFolder,
      renameNote,
      resolveWikilink,
      selectFile,
      selectVault,
      selectedFile,
      selectedVault,
      storeSavedNote,
      toggleFavorite,
      tree,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

type VaultIndex = {
  byId: Map<string, VaultNode>;
  byName: Map<string, VaultNode>;
  byPath: Map<string, VaultNode>;
};

function createVaultIndex(nodes: VaultNode[]): VaultIndex {
  const index: VaultIndex = {
    byId: new Map(),
    byName: new Map(),
    byPath: new Map(),
  };

  for (const node of flattenVaultTree(nodes)) {
    if (node.type !== 'markdown' && node.type !== 'image') continue;

    index.byId.set(node.id, node);
    index.byPath.set(normalizeWikilinkTarget(node.path), node);
    index.byName.set(normalizeWikilinkTarget(node.name), node);
  }

  return index;
}

function flattenVaultTree(nodes: VaultNode[]): VaultNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenVaultTree(node.children) : [])]);
}

function findVaultNodeByPath(nodes: VaultNode[], path: string) {
  return flattenVaultTree(nodes).find((node) => node.path === path) ?? null;
}

function normalizeWikilinkTarget(target: string) {
  const trimmedTarget = target.trim().replace(/^\/+/, '');
  return trimmedTarget.toLowerCase().endsWith('.md') ? trimmedTarget : `${trimmedTarget}.md`;
}

function addNodeToTree(nodes: VaultNode[], parentFolderId: string | null, node: VaultNode): VaultNode[] {
  if (!parentFolderId) {
    return sortVaultNodes([...nodes, node]);
  }

  return nodes.map((currentNode) => {
    if (currentNode.id === parentFolderId) {
      return {
        ...currentNode,
        children: sortVaultNodes([...(currentNode.children ?? []), node]),
      };
    }

    if (currentNode.children) {
      return {
        ...currentNode,
        children: addNodeToTree(currentNode.children, parentFolderId, node),
      };
    }

    return currentNode;
  });
}

function replaceNodeInTree(nodes: VaultNode[], replacement: VaultNode): VaultNode[] {
  return sortVaultNodes(
    nodes.map((node) => {
      if (node.id === replacement.id) {
        return replacement;
      }

      if (node.children) {
        return {
          ...node,
          children: replaceNodeInTree(node.children, replacement),
        };
      }

      return node;
    }),
  );
}

function removeNodeFromTree(nodes: VaultNode[], nodeId: string): VaultNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      if (!node.children) return node;

      return {
        ...node,
        children: removeNodeFromTree(node.children, nodeId),
      };
    });
}

function rebaseMovedNode(node: VaultNode, file: DriveFile, destinationPath: string): VaultNode {
  const movedNode = createVaultNode(file, destinationPath);

  if (node.type !== 'folder') return movedNode;

  return {
    ...movedNode,
    children: node.children?.map((child) => rebaseDescendantPath(child, movedNode.path)) ?? [],
  };
}

function rebaseDescendantPath(node: VaultNode, parentPath: string): VaultNode {
  const path = `${parentPath}/${node.name}`;
  return {
    ...node,
    path,
    children: node.children?.map((child) => rebaseDescendantPath(child, path)),
  };
}

function getParentPath(path: string) {
  return path.split('/').slice(0, -1).join('/');
}

function stripMarkdownExtension(name: string) {
  return name.replace(/\.md$/i, '');
}

function getNotePathFromHash() {
  const hash = window.location.hash;
  const routePrefix = '#/note/';

  if (!hash.startsWith(routePrefix)) {
    return null;
  }

  try {
    return decodeURIComponent(hash.slice(routePrefix.length));
  } catch {
    return null;
  }
}

function setNoteHash(path: string) {
  const nextHash = `#/note/${encodeURIComponent(path)}`;

  if (window.location.hash === nextHash) return;

  window.history.pushState(null, '', nextHash);
}

function replaceNoteHash(path: string) {
  window.history.replaceState(null, '', `#/note/${encodeURIComponent(path)}`);
}

function clearNoteHash(replace = false) {
  if (!window.location.hash.startsWith('#/note/')) return;

  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](null, '', window.location.pathname + window.location.search);
}

export function useVault() {
  const context = useContext(VaultContext);

  if (!context) {
    throw new Error('useVault must be used inside VaultProvider.');
  }

  return context;
}

function readStoredVault(): StoredVault | null {
  const storedValue = readMigratedStorage(localStorage, SELECTED_VAULT_KEY, LEGACY_SELECTED_VAULT_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as StoredVault;
  } catch {
    removeMigratedStorage(localStorage, SELECTED_VAULT_KEY, LEGACY_SELECTED_VAULT_KEY);
    return null;
  }
}

function readRecentNoteIds(vaultId: string | null): string[] {
  if (!vaultId) return [];

  try {
    const storedValue = readMigratedStorage(localStorage, RECENT_NOTES_KEY, LEGACY_RECENT_NOTES_KEY);
    if (!storedValue) return [];

    const recentNotesByVault = JSON.parse(storedValue) as Record<string, unknown>;
    const storedIds = recentNotesByVault[vaultId];

    return Array.isArray(storedIds)
      ? storedIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT_NOTES)
      : [];
  } catch {
    removeMigratedStorage(localStorage, RECENT_NOTES_KEY, LEGACY_RECENT_NOTES_KEY);
    return [];
  }
}

function writeRecentNoteIds(vaultId: string | null, noteIds: string[]) {
  if (!vaultId) return;

  let recentNotesByVault: Record<string, string[]> = {};

  try {
    const storedValue = readMigratedStorage(localStorage, RECENT_NOTES_KEY, LEGACY_RECENT_NOTES_KEY);
    if (storedValue) {
      const parsedValue = JSON.parse(storedValue) as unknown;
      if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
        recentNotesByVault = parsedValue as Record<string, string[]>;
      }
    }
  } catch {
    // Replace malformed local data with the current vault's valid history.
  }

  recentNotesByVault[vaultId] = noteIds.slice(0, MAX_RECENT_NOTES);
  localStorage.setItem(RECENT_NOTES_KEY, JSON.stringify(recentNotesByVault));
}
