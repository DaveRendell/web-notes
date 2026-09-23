import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Appearance, AppState, BackHandler, FlatList, Image as NativeImage, Keyboard, Linking, Modal, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { ChevronDown, ChevronLeft, ChevronRight, EllipsisVertical, FileCode2, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Image as ImageIcon, MoreHorizontal, RefreshCw, Save, Search, Settings, X } from 'lucide-react-native';
import { SvgUri } from 'react-native-svg';
import EditorSurface from './EditorSurface';
import { chooseVault, createFolder, createImage, createNote, listVault, listVaultFolder, openLocalWeeklyNote, readImageData, readLocalWeeklyTemplate, readNote, readNoteIconCache, readThemePreference, readVaultFavourites, readVaultListCache, restoreVault, saveNote, splitFrontmatter, writeNoteIconCache, writeThemePreference, writeVaultListCache, type LocalFolder, type LocalImage, type LocalNote, type LocalVaultItem, type ThemePreference } from './localVault';
import { buildBrowserRows, expandPath } from './localVaultTree';
import { replaceVaultFolderChildren } from './localVaultCore';
import { noteIconFromMarkdown, resolveFavouriteNotes } from './vaultFeatures';
import { MOBILE_AUTOSAVE_DELAY_MS, flushLatestDraft, shouldAutosave, type MobileEditorMode } from './autosave';
import { getTwemojiUrl } from '../web/src/lib/twemoji';
import { getLocalNoteSequenceNavigation } from './noteSequence';
import { resolveLocalVaultImage } from './vaultImages';
import { connectGoogleCalendar, loadGoogleCalendarEvents, loadGoogleCalendars, restoreCalendarConnection } from './calendarService';
import { getWeeklyNoteDetails } from '../web/src/lib/weeklyNote';

type OpenNote = { entry: LocalNote; frontmatter: string; body: string };

const lightPalette = {
  background: '#ffffff', surface: '#ffffff', surfaceMuted: '#f5f7f9', control: '#f0f3f6',
  controlHover: '#eef3f7', selected: '#dfeaf2', border: '#dfe3ea', subtleBorder: '#edf0f4',
  text: '#202124', textStrong: '#293241', rowText: '#303640', muted: '#697180', section: '#5f6673',
  accent: '#49627f', accentStrong: '#24577a', accentText: '#183f59', disabled: '#9aa3af',
  error: '#a14444', errorBackground: '#fff1f0', errorBorder: '#f2ceca', placeholder: '#8a929e',
  shadow: '#0f1721', statusBar: '#ffffff',
} as const;

type Palette = { [Key in keyof typeof lightPalette]: string };

const darkPalette: Palette = {
  background: '#12161b', surface: '#181e25', surfaceMuted: '#151b22', control: '#10151b',
  controlHover: '#26313d', selected: '#263d50', border: '#2b3643', subtleBorder: '#27313c',
  text: '#e7ebf0', textStrong: '#e2e7ed', rowText: '#dce3ea', muted: '#aab4c0', section: '#aeb8c3',
  accent: '#8ab7dc', accentStrong: '#3478a7', accentText: '#f3f6f9', disabled: '#66717e',
  error: '#f0aaa4', errorBackground: '#3a2224', errorBorder: '#60383a', placeholder: '#7f8a97',
  shadow: '#000000', statusBar: '#181e25',
};

export default function App() {
  const darkMode = useColorScheme() === 'dark';
  const palette = darkMode ? darkPalette : lightPalette;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [vaultUri, setVaultUri] = useState<string | null>(null);
  const [items, setItems] = useState<LocalVaultItem[]>([]);
  const [favouritePaths, setFavouritePaths] = useState<string[]>([]);
  const [favouritesExpanded, setFavouritesExpanded] = useState(true);
  const [filesExpanded, setFilesExpanded] = useState(true);
  const [noteIcons, setNoteIcons] = useState<Record<string, string | null>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [createParent, setCreateParent] = useState<LocalFolder | null>(null);
  const [createKind, setCreateKind] = useState<'note' | 'folder'>('note');
  const [createVisible, setCreateVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [openingWeeklyNote, setOpeningWeeklyNote] = useState(false);
  const [weeklyTemplateIcon, setWeeklyTemplateIcon] = useState<string | null>(null);
  const [active, setActive] = useState<OpenNote | null>(null);
  const [activeImage, setActiveImage] = useState<LocalImage | null>(null);
  const [editorNote, setEditorNote] = useState<OpenNote | null>(null);
  const [lastOpenedUri, setLastOpenedUri] = useState<string | null>(null);
  const [openingNoteUri, setOpeningNoteUri] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(true);
  const [pickerPending, setPickerPending] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(() => new Set());
  const [indexComplete, setIndexComplete] = useState(false);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [autosaveBlockedRevision, setAutosaveBlockedRevision] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [editorMode, setEditorMode] = useState<MobileEditorMode>('rich');
  const [noteMenuVisible, setNoteMenuVisible] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [dismissRevision, setDismissRevision] = useState(0);
  const draftRef = useRef('');
  const originalRef = useRef('');
  const activeRef = useRef<OpenNote | null>(null);
  const itemsRef = useRef<LocalVaultItem[]>([]);
  const savingRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const draftModeRef = useRef<MobileEditorMode>('rich');
  const draftRevisionRef = useRef(0);
  const pickerPendingRef = useRef(false);
  const newNameRef = useRef<TextInput>(null);
  const searchRef = useRef<TextInput>(null);
  const vaultUriRef = useRef<string | null>(null);
  const vaultGenerationRef = useRef(0);
  const loadedFoldersRef = useRef(new Set<string>());
  const pendingFolderLoadsRef = useRef(new Map<string, Promise<void>>());
  const scanPendingRef = useRef(false);
  const searchIndexAttemptedRef = useRef(false);
  const favoriteIndexAttemptedRef = useRef(false);
  const treeRevisionRef = useRef(0);
  const activeSessionRef = useRef(0);
  const openRequestRef = useRef(0);
  itemsRef.current = items;

  useEffect(() => {
    void restoreCalendarConnection().then(setCalendarConnected).catch((cause) => console.warn('Could not restore Google Calendar connection:', cause));
  }, []);

  useEffect(() => {
    void readThemePreference().then((preference) => {
      Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
      setThemePreference(preference);
    });
  }, []);

  const updateThemePreference = useCallback((preference: ThemePreference) => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    setThemePreference(preference);
    void writeThemePreference(preference);
  }, []);

  const loadFavourites = useCallback(async (uri: string) => {
    try {
      const paths = await readVaultFavourites(uri);
      if (vaultUriRef.current === uri) setFavouritePaths(paths);
    } catch (cause) {
      if (vaultUriRef.current === uri) setError(`Could not read favourites: ${String(cause)}`);
    }
  }, []);

  const loadFolder = useCallback(async (folderUri: string, parentPath: string, force = false) => {
    const pending = pendingFolderLoadsRef.current.get(folderUri);
    if (pending) {
      if (!force) return;
      await pending;
    }
    if (!force && loadedFoldersRef.current.has(folderUri)) return;
    const rootUri = vaultUriRef.current;
    const generation = vaultGenerationRef.current;
    if (!rootUri) return;
    const task = (async () => {
      setLoadingFolders((previous) => new Set(previous).add(folderUri));
      try {
        const children = await listVaultFolder(rootUri, folderUri, parentPath);
        if (vaultUriRef.current !== rootUri || vaultGenerationRef.current !== generation) return;
        loadedFoldersRef.current.add(folderUri);
        treeRevisionRef.current += 1;
        if (!scanPendingRef.current) searchIndexAttemptedRef.current = false;
        setIndexComplete(false);
        setItems((previous) => replaceVaultFolderChildren(previous, parentPath, children));
      } catch (cause) {
        if (vaultUriRef.current === rootUri && vaultGenerationRef.current === generation) setError(`Could not read ${parentPath || 'vault root'}: ${String(cause)}`);
      } finally {
        if (vaultGenerationRef.current === generation) setLoadingFolders((previous) => { const next = new Set(previous); next.delete(folderUri); return next; });
      }
    })();
    pendingFolderLoadsRef.current.set(folderUri, task);
    try { await task; }
    finally { if (pendingFolderLoadsRef.current.get(folderUri) === task) pendingFolderLoadsRef.current.delete(folderUri); }
  }, []);

  const refresh = useCallback(async (uri: string, foreground = true) => {
    if (scanPendingRef.current) return;
    scanPendingRef.current = true;
    if (foreground) setBusy(true);
    setScanning(true);
    setError(null);
    const revision = treeRevisionRef.current;
    const generation = vaultGenerationRef.current;
    try {
      const nextItems = await listVault(uri);
      if (vaultUriRef.current !== uri || vaultGenerationRef.current !== generation) return;
      if (treeRevisionRef.current !== revision) {
        searchIndexAttemptedRef.current = false;
        favoriteIndexAttemptedRef.current = false;
        return;
      }
      setItems(nextItems);
      setIndexComplete(true);
      loadedFoldersRef.current = new Set([uri, ...nextItems.filter((item) => item.kind === 'folder').map((item) => item.uri)]);
      treeRevisionRef.current += 1;
      setCreateParent((previous) => previous
        ? nextItems.find((item): item is LocalFolder => item.kind === 'folder' && item.uri === previous.uri) ?? null
        : null);
      void loadFavourites(uri);
    }
    catch (cause) { if (vaultUriRef.current === uri && vaultGenerationRef.current === generation) setError(`Could not refresh the vault: ${String(cause)}`); }
    finally { scanPendingRef.current = false; setScanning(false); if (foreground) setBusy(false); }
  }, [loadFavourites]);

  useEffect(() => {
    void restoreVault().then(async (uri) => {
      if (!uri) return;
      vaultGenerationRef.current += 1;
      vaultUriRef.current = uri;
      setVaultUri(uri);
      const cached = await readVaultListCache(uri);
      if (vaultUriRef.current !== uri) return;
      if (cached) { setItems(cached.items); setIndexComplete(cached.complete); }
      setNoteIcons(await readNoteIconCache(uri));
      setCacheLoaded(true);
      await Promise.all([loadFolder(uri, '', true), loadFavourites(uri)]);
    }).catch(() => setError('Saved folder access has expired. Choose your vault again.'))
      .finally(() => setBusy(false));
  }, [loadFolder, loadFavourites]);

  useEffect(() => {
    if (!vaultUri || !cacheLoaded) return;
    const timer = setTimeout(() => { void writeVaultListCache(vaultUri, items, indexComplete); }, 400);
    return () => clearTimeout(timer);
  }, [vaultUri, items, indexComplete, cacheLoaded]);

  useEffect(() => {
    if (!vaultUri || !cacheLoaded) return;
    const timer = setTimeout(() => { void writeNoteIconCache(vaultUri, noteIcons); }, 400);
    return () => clearTimeout(timer);
  }, [vaultUri, noteIcons, cacheLoaded]);

  useEffect(() => {
    let cancelled = false;
    setWeeklyTemplateIcon(null);
    if (vaultUri) {
      void readLocalWeeklyTemplate(vaultUri)
        .then((template) => {
          if (!cancelled) setWeeklyTemplateIcon(template ? noteIconFromMarkdown(template) : null);
        })
        .catch((cause) => console.warn('Could not load the weekly note template icon:', cause));
    }
    return () => { cancelled = true; };
  }, [vaultUri]);

  useEffect(() => {
    if (!search.trim()) { searchIndexAttemptedRef.current = false; return; }
    if (vaultUri && search.trim() && !indexComplete && !scanning && !scanPendingRef.current && !searchIndexAttemptedRef.current) {
      searchIndexAttemptedRef.current = true;
      void refresh(vaultUri, false);
    }
  }, [vaultUri, search, indexComplete, scanning, refresh]);

  useEffect(() => {
    if (!vaultUri || !cacheLoaded || indexComplete || scanning || loadingFolders.size > 0 || scanPendingRef.current || favoriteIndexAttemptedRef.current) return;
    if (favouritePaths.some((path) => !items.some((item) => item.kind === 'note' && item.path === path))) {
      favoriteIndexAttemptedRef.current = true;
      void refresh(vaultUri, false);
    }
  }, [vaultUri, cacheLoaded, indexComplete, scanning, loadingFolders, favouritePaths, items, refresh]);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setDismissRevision((value) => value + 1);
      setEditorFocused(false);
    });
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  const save = useCallback((): Promise<boolean> => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const note = activeRef.current;
    if (!note) return Promise.resolve(false);
    if (draftRef.current === originalRef.current) return Promise.resolve(true);
    const saveSession = activeSessionRef.current;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const task = (async () => {
      try {
        const snapshot = draftRef.current;
        await saveNote(note.entry.uri, originalRef.current, snapshot);
        if (activeSessionRef.current !== saveSession || activeRef.current !== note) return true;
        originalRef.current = snapshot;
        setAutosaveBlockedRevision(null);
        setNoteIcons((previous) => ({ ...previous, [note.entry.path]: noteIconFromMarkdown(snapshot) }));
        setDirty(draftRef.current !== snapshot);
        return true;
      } catch (cause) {
        if (activeSessionRef.current !== saveSession || activeRef.current !== note) return false;
        setAutosaveBlockedRevision(draftRevisionRef.current);
        setError(String(cause));
        return false;
      } finally {
        savePromiseRef.current = null;
        savingRef.current = false;
        setSaving(false);
      }
    })();
    savePromiseRef.current = task;
    return task;
  }, []);

  const saveLatestDraft = useCallback(async (): Promise<boolean> => {
    const result = await flushLatestDraft({
      getPendingSave: () => savePromiseRef.current,
      isClean: () => draftRef.current === originalRef.current,
      save,
    });
    if (result === 'changing') setError('The note kept changing while it was being saved. Please try again.');
    return result === 'saved';
  }, [save]);

  useEffect(() => {
    if (!active?.entry.uri || !shouldAutosave({
      blockedRevision: autosaveBlockedRevision,
      dirty,
      mode: draftModeRef.current,
      revision: draftRevision,
      saving,
    })) return;

    const timer = setTimeout(() => { void save(); }, MOBILE_AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active?.entry.uri, autosaveBlockedRevision, dirty, draftRevision, save, saving]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (
        state !== 'active' &&
        draftModeRef.current === 'rich' &&
        draftRef.current !== originalRef.current
      ) void saveLatestDraft();
    });
    return () => subscription.remove();
  }, [saveLatestDraft]);

  const closeNote = useCallback(() => {
    const finish = () => {
      activeRef.current = null;
      setActive(null);
      setActiveImage(null);
      setDirty(false);
      setError(null);
      setEditorFocused(false);
      setDismissRevision((value) => value + 1);
      Keyboard.dismiss();
    };
    if (draftRef.current === originalRef.current && !savePromiseRef.current) { finish(); return; }
    if (draftModeRef.current === 'rich') {
      setDismissRevision((value) => value + 1);
      setEditorFocused(false);
      Keyboard.dismiss();
      void saveLatestDraft().then((ok) => { if (ok) finish(); });
      return;
    }
    Alert.alert('Unsaved changes', 'Save this note before leaving?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: finish },
      { text: 'Save', onPress: () => { void saveLatestDraft().then((ok) => { if (ok) finish(); }); } },
    ]);
  }, [saveLatestDraft]);

  const discardDraft = useCallback(() => {
    const note = activeRef.current;
    if (!note) return;
    const restored = { ...note, ...splitFrontmatter(originalRef.current) };
    draftRef.current = originalRef.current;
    draftModeRef.current = 'rich';
    draftRevisionRef.current += 1;
    activeRef.current = restored;
    setActive(restored);
    setEditorNote(restored);
    setEditorMode('rich');
    setDraftRevision(draftRevisionRef.current);
    setDirty(false);
    setAutosaveBlockedRevision(null);
    setError(null);
    activeSessionRef.current += 1;
    setSession(activeSessionRef.current);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (createVisible || searchVisible || settingsVisible || noteMenuVisible) {
        setCreateVisible(false);
        setSearchVisible(false);
        setSettingsVisible(false);
        setNoteMenuVisible(false);
        setSearch('');
        Keyboard.dismiss();
        return true;
      }
      if (keyboardVisible || editorFocused) {
        setDismissRevision((value) => value + 1);
        setEditorFocused(false);
        Keyboard.dismiss();
        return true;
      }
      if (activeRef.current) { closeNote(); return true; }
      if (activeImage) { setActiveImage(null); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [activeImage, closeNote, createVisible, editorFocused, keyboardVisible, noteMenuVisible, searchVisible, settingsVisible]);

  const openNote = useCallback(async (entry: LocalNote) => {
    const request = ++openRequestRef.current;
    setOpeningNoteUri(entry.uri);
    setBusy(true);
    setError(null);
    setNoteMenuVisible(false);
    try {
      const original = await readNote(entry.uri);
      if (request !== openRequestRef.current) return;
      const { frontmatter, body } = splitFrontmatter(original);
      const next = { entry, frontmatter, body };
      setNoteIcons((previous) => ({ ...previous, [entry.path]: noteIconFromMarkdown(original) }));
      originalRef.current = original;
      draftRef.current = original;
      draftModeRef.current = 'rich';
      setEditorMode('rich');
      draftRevisionRef.current = 0;
      activeRef.current = next;
      setActive(next);
      setActiveImage(null);
      setEditorNote(next);
      setLastOpenedUri(entry.uri);
      setDirty(false);
      setDraftRevision(0);
      setAutosaveBlockedRevision(null);
      activeSessionRef.current += 1;
      setSession(activeSessionRef.current);
    } catch (cause) { if (request === openRequestRef.current) setError(`Could not open ${entry.path}: ${String(cause)}`); }
    finally { if (request === openRequestRef.current) { setOpeningNoteUri(null); setBusy(false); } }
  }, []);

  const openImage = useCallback((entry: LocalImage) => {
    activeRef.current = null;
    setActive(null);
    setActiveImage(entry);
    setLastOpenedUri(entry.uri);
    setError(null);
    Keyboard.dismiss();
  }, []);

  const pickVault = async () => {
    if (pickerPendingRef.current || busy) return;
    pickerPendingRef.current = true;
    setPickerPending(true);
    setBusy(true);
    try {
      const uri = await chooseVault();
      if (!uri) return;
      openRequestRef.current += 1;
      setOpeningNoteUri(null);
      vaultGenerationRef.current += 1;
      vaultUriRef.current = uri;
      loadedFoldersRef.current.clear();
      pendingFolderLoadsRef.current.clear();
      searchIndexAttemptedRef.current = false;
      favoriteIndexAttemptedRef.current = false;
      setLoadingFolders(new Set());
      treeRevisionRef.current += 1;
      setCacheLoaded(false);
      setIndexComplete(false);
      setVaultUri(uri);
      setItems([]);
      setFavouritePaths([]);
      setNoteIcons({});
      setExpanded(new Set());
      setCreateParent(null);
      setLastOpenedUri(null);
      setEditorNote(null);
      const cached = await readVaultListCache(uri);
      if (cached) { setItems(cached.items); setIndexComplete(cached.complete); }
      setNoteIcons(await readNoteIconCache(uri));
      setCacheLoaded(true);
      await Promise.all([loadFolder(uri, '', true), loadFavourites(uri)]);
    } catch (cause) { setError(`Could not open the selected folder: ${String(cause)}`); }
    finally {
      pickerPendingRef.current = false;
      setPickerPending(false);
      setBusy(false);
    }
  };

  const addItem = async () => {
    if (!vaultUri || busy || !newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const parentUri = createParent?.uri ?? vaultUri;
      const parentPath = createParent?.path ?? '';
      const entry = createKind === 'note'
        ? await createNote(parentUri, parentPath, newName)
        : await createFolder(parentUri, parentPath, newName);
      setNewName('');
      setCreateVisible(false);
      setExpanded((previous) => expandPath(previous, parentPath));
      setSearch('');
      await loadFolder(parentUri, parentPath, true);
      if (entry.kind === 'note') await openNote(entry);
    } catch (cause) { setError(`Could not create ${createKind}: ${String(cause)}`); }
    finally { setBusy(false); }
  };

  const showCreate = (kind: 'note' | 'folder', parent: LocalFolder | null) => {
    setCreateKind(kind);
    setCreateParent(parent);
    setNewName('');
    setCreateVisible(true);
    requestAnimationFrame(() => newNameRef.current?.focus());
  };

  const showFolderActions = (folder: LocalFolder) => {
    Alert.alert(folder.name, `Create inside ${folder.path}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New folder', onPress: () => showCreate('folder', folder) },
      { text: 'New note', onPress: () => showCreate('note', folder) },
    ]);
  };

  const openThisWeek = async () => {
    if (!vaultUri || busy || openingWeeklyNote) return;
    setOpeningWeeklyNote(true);
    setError(null);
    try {
      const note = await openLocalWeeklyNote(vaultUri);
      await refresh(vaultUri, false);
      await openNote(note);
    } catch (cause) {
      setError(`Could not open this week's note: ${String(cause)}`);
    } finally {
      setOpeningWeeklyNote(false);
    }
  };

  const rows = useMemo(() => buildBrowserRows(items, expanded, ''), [items, expanded]);
  const searchRows = useMemo(() => search.trim()
    ? buildBrowserRows(items, expanded, search).filter(({ item }) => item.kind === 'note')
    : [], [items, expanded, search]);
  const favouriteNotes = useMemo(() => resolveFavouriteNotes(items, favouritePaths), [items, favouritePaths]);
  const weeklyDetails = getWeeklyNoteDetails(new Date());
  const weeklyNote = items.find((item): item is LocalNote => item.kind === 'note' && item.path === weeklyDetails.path) ?? null;
  const weeklyIcon = weeklyNote ? noteIcons[weeklyNote.path] : weeklyTemplateIcon;
  const sequenceNavigation = useMemo(() => active
    ? getLocalNoteSequenceNavigation(active.entry, items.filter((item): item is LocalNote => item.kind === 'note'))
    : null, [active, items]);
  const toggleFolder = (folder: LocalFolder) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(folder.path)) next.delete(folder.path);
      else next.add(folder.path);
      return next;
    });
    if (!expanded.has(folder.path)) void loadFolder(folder.uri, folder.path);
  };
  const noop = useCallback(async () => {}, []);
  const editorImages = useMemo(() => items.filter((item): item is LocalImage => item.kind === 'image').map((image) => ({ id: image.uri, name: image.name, path: image.path })), [items]);
  const loadEditorImage = useCallback(async (source: string) => {
    const note = activeRef.current;
    if (!note) throw new Error('Open a note before loading a vault image.');
    const image = resolveLocalVaultImage(source, note.entry.path, itemsRef.current);
    if (!image) throw new Error('Image not found in this vault.');
    return { dataUrl: await readImageData(image.uri, image.mimeType) };
  }, []);
  const uploadEditorImage = useCallback(async ({ name, mimeType, base64 }: { name: string; mimeType: string; base64: string }) => {
    const root = vaultUriRef.current;
    const note = activeRef.current;
    if (!root || !note) throw new Error('Open a note before adding an image.');
    const parent = note.entry.parentPath
      ? itemsRef.current.find((item): item is LocalFolder => item.kind === 'folder' && item.path === note.entry.parentPath)
      : null;
    if (note.entry.parentPath && !parent) throw new Error('The note folder is not loaded. Refresh the vault and try again.');
    const image = await createImage(parent?.uri ?? root, note.entry.parentPath, name, mimeType, base64);
    setItems((previous) => [...previous.filter((item) => item.uri !== image.uri), image]);
    return { id: image.uri, name: image.name, path: image.path };
  }, []);
  const connectCalendar = useCallback(async () => {
    const calendars = await connectGoogleCalendar();
    setCalendarConnected(true);
    return calendars;
  }, []);
  const openExternal = useCallback(async (url: string) => {
    if (!/^https:\/\//i.test(url)) throw new Error('Only secure web links can be opened.');
    await Linking.openURL(url);
  }, []);
  const openSequenceNote = useCallback(async (note: LocalNote | null) => {
    if (!note) return;
    setNoteMenuVisible(false);
    if (!await saveLatestDraft()) return;
    await openNote(note);
  }, [openNote, saveLatestDraft]);

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.statusBar} />
      {active || activeImage ? (
        <>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={active ? 'Close note' : 'Close image'} onPress={active ? closeNote : () => setActiveImage(null)} style={styles.iconButton}><ChevronLeft size={23} color={palette.textStrong} /></Pressable>
            <View style={styles.noteToolbarActions}>
              {activeImage && <View style={styles.imageHeaderDetails}><Text style={styles.imageHeaderName} numberOfLines={1}>{activeImage.name}</Text><Text style={styles.imageHeaderMeta}>{activeImage.mimeType.replace(/^image\//, '').toUpperCase()} · {formatFileSize(activeImage.size)}</Text></View>}
              {active && saving && <ActivityIndicator accessibilityLabel="Saving note" size="small" color={palette.accent} />}
              {active && <>
              <View accessibilityRole="radiogroup" accessibilityLabel="Editor mode" style={styles.editorModeSwitch}>
                <Pressable accessibilityRole="radio" accessibilityLabel="Rich text" accessibilityState={{ selected: editorMode === 'rich' }} onPress={() => setEditorMode('rich')} style={[styles.editorModeButton, editorMode === 'rich' && styles.editorModeButtonActive]}>
                  <FileText size={18} color={editorMode === 'rich' ? palette.accentText : palette.muted} />
                </Pressable>
                <Pressable accessibilityRole="radio" accessibilityLabel="Markdown source" accessibilityState={{ selected: editorMode === 'source' }} onPress={() => setEditorMode('source')} style={[styles.editorModeButton, editorMode === 'source' && styles.editorModeButtonActive]}>
                  <FileCode2 size={18} color={editorMode === 'source' ? palette.accentText : palette.muted} />
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Note actions" onPress={() => setNoteMenuVisible(true)} style={styles.iconButton}><EllipsisVertical size={20} color={palette.textStrong} /></Pressable>
              </>}
            </View>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
        </>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Web Notes</Text>
            {vaultUri && (
              <View style={styles.toolbarActions}>
                <Pressable accessibilityRole="button" accessibilityLabel="Find notes" onPress={() => { setSearchVisible(true); requestAnimationFrame(() => searchRef.current?.focus()); }} style={styles.iconButton}>
                  <Search size={20} color={palette.textStrong} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => setSettingsVisible(true)} style={styles.iconButton}>
                  <Settings size={20} color={palette.textStrong} />
                </Pressable>
              </View>
            )}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          {!vaultUri ? (
            <View style={styles.welcome}>
              <Text style={styles.welcomeText}>Choose the folder where your notes are synced on this phone. Web Notes will only read and write inside that folder.</Text>
              <Pressable onPress={() => { void pickVault(); }} disabled={busy || pickerPending} style={styles.primaryButton}><Text style={styles.primaryText}>{pickerPending ? 'Waiting for folder picker…' : busy ? 'Checking saved folder…' : 'Choose vault folder'}</Text></Pressable>
            </View>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open this week's note: ${weeklyDetails.filename.replace(/\.md$/i, '')}`}
                onPress={() => { void openThisWeek(); }}
                disabled={busy || openingWeeklyNote}
                style={[styles.favouriteRow, styles.weeklyNoteRow, weeklyNote?.uri === lastOpenedUri && styles.selectedRow]}
              >
                <NoteIcon emoji={weeklyIcon} fallbackColor={palette.muted} />
                <View style={styles.noteText}>
                  <Text style={styles.noteName} numberOfLines={1}>{weeklyDetails.filename.replace(/\.md$/i, '')}</Text>
                </View>
                {openingWeeklyNote && <ActivityIndicator size="small" color={palette.accent} />}
              </Pressable>
              <View style={styles.favouritesSection}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${favouritesExpanded ? 'Collapse' : 'Expand'} favourites`} onPress={() => setFavouritesExpanded((open) => !open)} style={styles.favouritesHeading}>
                  {favouritesExpanded ? <ChevronDown size={15} color={palette.muted} /> : <ChevronRight size={15} color={palette.muted} />}
                  <Text style={styles.sectionTitle}>Favourites</Text>
                </Pressable>
                {favouritesExpanded && (
                  <ScrollView style={styles.favouritesList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {favouriteNotes.length === 0 ? <Text style={styles.favouritesEmpty}>Favourite notes will appear here.</Text> : favouriteNotes.map((note) => (
                      <Pressable key={note.uri} accessibilityRole="button" accessibilityLabel={`Open favourite ${note.path}`} onPress={() => { void openNote(note); }} style={[styles.favouriteRow, note.uri === lastOpenedUri && styles.selectedRow]}>
                        <NoteIcon emoji={noteIcons[note.path]} fallbackColor={palette.muted} />
                        <View style={styles.noteText}>
                          <Text style={styles.noteName} numberOfLines={1}>{note.name.replace(/\.md$/i, '')}</Text>
                        </View>
                        {note.uri === openingNoteUri && <ActivityIndicator size="small" color={palette.accent} />}
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
              <View style={styles.filesHeading}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${filesExpanded ? 'Collapse' : 'Expand'} files`} onPress={() => setFilesExpanded((open) => !open)} style={styles.filesToggle}>
                  {filesExpanded ? <ChevronDown size={15} color={palette.muted} /> : <ChevronRight size={15} color={palette.muted} />}
                  <Text style={styles.filesTitle}>Files</Text>
                </Pressable>
                {(scanning || loadingFolders.size > 0) && <ActivityIndicator size="small" color={palette.accent} />}
                <Pressable accessibilityRole="button" accessibilityLabel="New note in vault root" onPress={() => showCreate('note', null)} style={styles.sectionAction}>
                  <FilePlus2 size={18} color={palette.textStrong} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="New folder in vault root" onPress={() => showCreate('folder', null)} style={styles.sectionAction}>
                  <FolderPlus size={18} color={palette.textStrong} />
                </Pressable>
              </View>
              {filesExpanded && <FlatList
                data={rows}
                keyExtractor={({ item }) => item.uri}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: row }) => row.item.kind === 'folder' ? (
                  <View style={[styles.treeRow, { paddingLeft: 14 + Math.min(row.depth, 10) * 16 }]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded.has(row.item.path) ? 'Collapse' : 'Expand'} ${row.item.name}`} onPress={() => toggleFolder(row.item as LocalFolder)} style={styles.folderToggle}>
                      {expanded.has(row.item.path) ? <ChevronDown size={17} color={palette.muted} /> : <ChevronRight size={17} color={palette.muted} />}
                      {expanded.has(row.item.path) ? <FolderOpen size={17} color={palette.accent} /> : <Folder size={17} color={palette.accent} />}
                      <Text style={styles.folderLabel} numberOfLines={1}>{row.item.name}</Text>
                      {loadingFolders.has(row.item.uri) && <ActivityIndicator size="small" color={palette.accent} />}
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Folder actions for ${row.item.path}`} onPress={() => showFolderActions(row.item as LocalFolder)} style={styles.folderAdd}>
                      <MoreHorizontal size={19} color={palette.muted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Open ${row.item.path}`} onPress={() => {
                    if (row.item.kind === 'image') openImage(row.item);
                    else if (row.item.kind === 'note') void openNote(row.item);
                  }} style={[styles.treeRow, row.item.uri === lastOpenedUri && styles.selectedRow, { paddingLeft: 14 + Math.min(row.depth, 10) * 16 }]}>
                    {row.item.kind === 'image' ? <View style={styles.noteIcon}><ImageIcon size={17} color={palette.muted} /></View> : <NoteIcon emoji={noteIcons[row.item.path]} fallbackColor={palette.muted} />}
                    <View style={styles.noteText}>
                      <Text style={styles.noteName} numberOfLines={1}>{row.item.kind === 'note' ? row.item.name.replace(/\.md$/i, '') : row.item.name}</Text>
                      {row.searchResult && <Text style={styles.notePath} numberOfLines={1}>{row.item.path}</Text>}
                    </View>
                    {row.item.uri === openingNoteUri && <ActivityIndicator size="small" color={palette.accent} />}
                  </Pressable>
                )}
                ListEmptyComponent={!busy && loadingFolders.size === 0 ? <Text style={styles.empty}>No notes, images, or folders found.</Text> : null}
              />}
            </>
          )}
        </>
      )}
      <Modal visible={searchVisible} transparent animationType="fade" onRequestClose={() => { setSearchVisible(false); setSearch(''); }}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setSearchVisible(false); setSearch(''); }}>
          <Pressable style={[styles.modalPanel, styles.searchPanel]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalTitleRow}>
              <Search size={20} color={palette.accent} />
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                placeholder="Find notes"
                placeholderTextColor={palette.placeholder}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                returnKeyType="search"
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={() => { setSearchVisible(false); setSearch(''); }} style={styles.iconButton}>
                <X size={20} color={palette.muted} />
              </Pressable>
            </View>
            <FlatList
              data={searchRows}
              keyExtractor={({ item }) => item.uri}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: row }) => (
                <Pressable style={styles.searchResult} onPress={() => { setSearchVisible(false); setSearch(''); void openNote(row.item as LocalNote); }}>
                  <NoteIcon emoji={noteIcons[row.item.path]} fallbackColor={palette.muted} />
                  <View style={styles.noteText}>
                    <Text style={styles.noteName} numberOfLines={1}>{row.item.name.replace(/\.md$/i, '')}</Text>
                    <Text style={styles.notePath} numberOfLines={1}>{row.item.path}</Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.modalEmpty}>{search.trim() ? (scanning ? 'Indexing vault…' : 'No matching notes.') : 'Type a note name or path.'}</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateVisible(false)}>
          <Pressable style={styles.modalPanel} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>New {createKind}</Text>
            <Text style={styles.modalCopy} numberOfLines={2}>Create in {createParent?.path ?? 'vault root'}</Text>
            <TextInput
              ref={newNameRef}
              style={[styles.input, styles.modalInput]}
              placeholder={createKind === 'note' ? 'Note name' : 'Folder name'}
              placeholderTextColor={palette.placeholder}
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={() => { void addItem(); }}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateVisible(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
              <Pressable onPress={() => { void addItem(); }} disabled={!newName.trim() || busy} style={[styles.primaryButton, (!newName.trim() || busy) && styles.buttonDisabled]}><Text style={styles.primaryText}>Create</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSettingsVisible(false)}>
          <Pressable style={styles.settingsPanel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.settingsTitleRow}>
              <Text style={styles.modalTitle}>Settings</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={() => setSettingsVisible(false)} style={styles.iconButton}><X size={20} color={palette.muted} /></Pressable>
            </View>
            <View style={styles.appearanceSetting}>
              <Text style={styles.appearanceLabel}>Appearance</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={styles.appearanceSwitch}>
                {(['system', 'light', 'dark'] as const).map((preference) => (
                  <Pressable
                    key={preference}
                    accessibilityRole="radio"
                    accessibilityLabel={`${preference[0].toUpperCase()}${preference.slice(1)} appearance`}
                    accessibilityState={{ selected: themePreference === preference }}
                    onPress={() => updateThemePreference(preference)}
                    style={[styles.appearanceButton, themePreference === preference && styles.appearanceButtonActive]}
                  >
                    <Text style={[styles.appearanceButtonText, themePreference === preference && styles.appearanceButtonTextActive]}>{preference[0].toUpperCase()}{preference.slice(1)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Pressable style={styles.menuItem} disabled={busy || scanning} onPress={() => { setSettingsVisible(false); if (vaultUri) void refresh(vaultUri); }}>
              <RefreshCw size={19} color={busy || scanning ? palette.disabled : palette.textStrong} />
              <Text style={[styles.menuItemText, (busy || scanning) && styles.disabled]}>Refresh vault</Text>
            </Pressable>
            <Pressable style={styles.menuItem} disabled={busy || pickerPending} onPress={() => { setSettingsVisible(false); void pickVault(); }}>
              <FolderOpen size={19} color={busy || pickerPending ? palette.disabled : palette.textStrong} />
              <Text style={[styles.menuItemText, (busy || pickerPending) && styles.disabled]}>Change vault folder</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={noteMenuVisible} transparent animationType="fade" onRequestClose={() => setNoteMenuVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNoteMenuVisible(false)}>
          <Pressable style={styles.settingsPanel} onPress={(event) => event.stopPropagation()}>
            {sequenceNavigation && (sequenceNavigation.previous || sequenceNavigation.next) && (
              <View style={styles.sequenceNavigation} accessibilityRole="toolbar" accessibilityLabel="Sequential notes">
                <Pressable accessibilityRole="button" accessibilityLabel={`Previous note: ${sequenceNavigation.previousNumber}`} disabled={!sequenceNavigation.previous} onPress={() => { void openSequenceNote(sequenceNavigation.previous); }} style={styles.sequenceButton}>
                  <ChevronLeft size={18} color={sequenceNavigation.previous ? palette.textStrong : palette.disabled} /><Text style={[styles.sequenceNumber, !sequenceNavigation.previous && styles.disabled]}>{sequenceNavigation.previousNumber}</Text>
                </Pressable>
                <Text style={styles.sequenceCurrent}>{sequenceNavigation.currentNumber}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Next note: ${sequenceNavigation.nextNumber}`} disabled={!sequenceNavigation.next} onPress={() => { void openSequenceNote(sequenceNavigation.next); }} style={styles.sequenceButton}>
                  <Text style={[styles.sequenceNumber, !sequenceNavigation.next && styles.disabled]}>{sequenceNavigation.nextNumber}</Text><ChevronRight size={18} color={sequenceNavigation.next ? palette.textStrong : palette.disabled} />
                </Pressable>
              </View>
            )}
            {active?.frontmatter && <Pressable style={styles.menuItem} onPress={() => { setNoteMenuVisible(false); Alert.alert('Properties', active.frontmatter.trim().replace(/^---\r?\n?|\r?\n---$/g, '')); }}>
              <FileText size={19} color={palette.textStrong} /><Text style={styles.menuItemText}>Properties</Text>
            </Pressable>}
            <Pressable style={styles.menuItem} disabled={!dirty || saving} onPress={() => { setNoteMenuVisible(false); void save(); }}>
              <Save size={19} color={!dirty || saving ? palette.disabled : palette.textStrong} /><Text style={[styles.menuItemText, (!dirty || saving) && styles.disabled]}>Save now</Text>
            </Pressable>
            <Pressable style={styles.menuItem} disabled={!dirty || saving} onPress={() => { setNoteMenuVisible(false); Alert.alert('Discard changes?', 'Restore the last saved version of this note.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: discardDraft }]); }}>
              <X size={19} color={!dirty || saving ? palette.disabled : palette.error} /><Text style={[styles.menuItemText, (!dirty || saving) && styles.disabled]}>Discard changes</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setNoteMenuVisible(false); Alert.alert(active?.entry.name.replace(/\.md$/i, '') ?? 'Note', active?.entry.path ?? ''); }}>
              <FileCode2 size={19} color={palette.textStrong} /><Text style={styles.menuItemText}>Note details</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      {editorNote && (
        <View style={active ? styles.editor : styles.hiddenEditor}>
          <EditorSurface
            fixtureName={editorNote.entry.path}
            markdown={editorNote.body}
            session={session}
            keyboardVisible={keyboardVisible}
            dismissRevision={dismissRevision}
            requestedMode={editorMode}
            darkMode={darkMode}
            onModeChange={setEditorMode}
            images={editorImages}
            onLoadImage={loadEditorImage}
            onUploadImage={uploadEditorImage}
            calendarConnected={calendarConnected}
            onCalendarConnect={connectCalendar}
            onCalendarList={loadGoogleCalendars}
            onCalendarEvents={loadGoogleCalendarEvents}
            onOpenExternal={openExternal}
            snapshotRequest={0}
            onEvent={noop}
            onWriteAttempt={noop}
            onEditorFocusChange={async (event) => { if (activeRef.current && event.session === session) setEditorFocused(event.focused); }}
            onDraftChange={async ({ markdown: body, mode, session: draftSession }) => {
              if (draftSession !== activeSessionRef.current || activeRef.current?.entry.uri !== editorNote.entry.uri) return;
              const full = editorNote.frontmatter + body;
              draftRef.current = full;
              draftModeRef.current = mode;
              draftRevisionRef.current += 1;
              setDraftRevision(draftRevisionRef.current);
              setAutosaveBlockedRevision(null);
              setDirty(full !== originalRef.current);
            }}
          />
        </View>
      )}
      {activeImage && <View style={styles.imageViewer}><NativeImage accessibilityLabel={activeImage.name} source={{ uri: activeImage.uri }} resizeMode="contain" style={styles.imageViewerImage} /></View>}
    </SafeAreaView>
  );
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Size unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function NoteIcon({ emoji, fallbackColor }: { emoji: string | null | undefined; fallbackColor: string }) {
  const twemojiUrl = emoji ? getTwemojiUrl(emoji) : null;
  return (
    <View style={noteIconStyles.noteIcon}>
      {twemojiUrl ? <TwemojiNoteIcon key={twemojiUrl} url={twemojiUrl} fallbackColor={fallbackColor} /> : <GenericNoteIcon color={fallbackColor} />}
    </View>
  );
}

function TwemojiNoteIcon({ url, fallbackColor }: { url: string; fallbackColor: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setFailed(true), []);

  if (failed) return <GenericNoteIcon color={fallbackColor} />;
  return (
    <>
      {!loaded && <GenericNoteIcon color={fallbackColor} />}
      <SvgUri
        height={18}
        onError={handleError}
        onLoad={handleLoad}
        style={loaded ? undefined : noteIconStyles.loadingNoteEmoji}
        uri={url}
        width={18}
      />
    </>
  );
}

function GenericNoteIcon({ color }: { color: string }) {
  return <FileText size={17} color={color} />;
}

const noteIconStyles = StyleSheet.create({
  noteIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  loadingNoteEmoji: { position: 'absolute', opacity: 0 },
});

function createStyles(palette: Palette) {
 return StyleSheet.create({
  page: { flex: 1, paddingTop: StatusBar.currentHeight ?? 0, backgroundColor: palette.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  title: { fontSize: 20, fontWeight: '700', color: palette.text },
  noteToolbarActions: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  imageHeaderDetails: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  imageHeaderName: { maxWidth: '100%', color: palette.textStrong, fontSize: 15, fontWeight: '600' },
  imageHeaderMeta: { color: palette.muted, fontSize: 11, marginTop: 2 },
  editorModeSwitch: { flexDirection: 'row', alignItems: 'center', padding: 2, borderRadius: 7, backgroundColor: palette.control },
  editorModeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  editorModeButtonActive: { backgroundColor: palette.selected },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconButton: { width: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  disabled: { color: palette.disabled },
  error: { paddingHorizontal: 14, paddingVertical: 10, color: palette.error, backgroundColor: palette.errorBackground, borderBottomWidth: 1, borderColor: palette.errorBorder },
  editor: { flex: 1 },
  hiddenEditor: { display: 'none' },
  imageViewer: { flex: 1, padding: 12, backgroundColor: palette.surfaceMuted },
  imageViewerImage: { width: '100%', height: '100%' },
  welcome: { padding: 24, gap: 20 },
  welcomeText: { fontSize: 16, lineHeight: 24, color: palette.section },
  primaryButton: { alignSelf: 'flex-start', backgroundColor: palette.accentStrong, borderRadius: 6, paddingHorizontal: 18, paddingVertical: 12 },
  primaryText: { color: 'white', fontSize: 16, fontWeight: '600' },
  input: { marginHorizontal: 12, marginTop: 10, minHeight: 44, borderWidth: 1, borderColor: palette.border, borderRadius: 7, backgroundColor: palette.surface, paddingHorizontal: 12, paddingVertical: 9, color: palette.text, fontSize: 15 },
  filesHeading: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingHorizontal: 14 },
  filesToggle: { minHeight: 39, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  filesTitle: { color: palette.section, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionAction: { width: 34, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  weeklyNoteRow: { marginTop: 10 },
  favouritesSection: { marginTop: 2 },
  favouritesHeading: { minHeight: 39, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 5, backgroundColor: palette.surface },
  sectionTitle: { flex: 1, color: palette.section, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  favouritesList: { maxHeight: 210 },
  favouritesEmpty: { paddingHorizontal: 32, paddingBottom: 10, color: palette.muted, fontSize: 13 },
  favouriteRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42, marginHorizontal: 10, paddingHorizontal: 6, borderRadius: 5 },
  treeRow: { flexDirection: 'row', alignItems: 'center', minHeight: 43, marginHorizontal: 8, paddingRight: 8, borderRadius: 5 },
  selectedRow: { backgroundColor: palette.selected },
  folderToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 43, gap: 8 },
  folderLabel: { flex: 1, color: palette.rowText, fontSize: 15, fontWeight: '600' },
  folderAdd: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noteIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  noteText: { flex: 1, paddingVertical: 8 },
  noteName: { color: palette.rowText, fontSize: 15 },
  notePath: { color: palette.muted, fontSize: 12, marginTop: 3 },
  empty: { padding: 18, color: palette.muted },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#00000066' },
  modalPanel: { maxHeight: '82%', padding: 20, borderRadius: 10, backgroundColor: palette.surface, shadowColor: palette.shadow, shadowOpacity: 0.35, shadowRadius: 24, elevation: 8 },
  searchPanel: { height: '72%', padding: 0, overflow: 'hidden' },
  modalTitleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8, borderBottomWidth: 1, borderColor: palette.border },
  searchInput: { flex: 1, minHeight: 50, color: palette.text, fontSize: 16 },
  modalTitle: { color: palette.text, fontSize: 19, fontWeight: '700' },
  modalCopy: { marginTop: 6, color: palette.muted, fontSize: 14 },
  modalInput: { marginHorizontal: 0, marginTop: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 6, backgroundColor: palette.controlHover },
  secondaryButtonText: { color: palette.textStrong, fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  searchResult: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: palette.subtleBorder },
  modalEmpty: { padding: 18, color: palette.muted, textAlign: 'center' },
  settingsPanel: { marginTop: 'auto', marginBottom: 20, padding: 8, borderRadius: 10, backgroundColor: palette.surface, shadowColor: palette.shadow, shadowOpacity: 0.35, shadowRadius: 24, elevation: 8 },
  sequenceNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, marginBottom: 4, borderRadius: 6, backgroundColor: palette.surfaceMuted },
  sequenceButton: { minWidth: 68, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 5 },
  sequenceNumber: { color: palette.textStrong, fontSize: 15, fontWeight: '600' },
  sequenceCurrent: { minWidth: 38, color: palette.section, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  settingsTitleRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10 },
  appearanceSetting: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  appearanceLabel: { color: palette.section, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  appearanceSwitch: { flexDirection: 'row', padding: 2, borderRadius: 7, backgroundColor: palette.control },
  appearanceButton: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  appearanceButtonActive: { backgroundColor: palette.selected },
  appearanceButtonText: { color: palette.muted, fontSize: 13, fontWeight: '600' },
  appearanceButtonTextActive: { color: palette.accentText },
  menuItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 6 },
  menuItemText: { color: palette.rowText, fontSize: 16 },
});
}
