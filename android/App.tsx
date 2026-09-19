import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, FlatList, Keyboard, Modal, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarDays, ChevronDown, ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, MoreHorizontal, RefreshCw, Search, Settings, X } from 'lucide-react-native';
import EditorSurface from './EditorSurface';
import { chooseVault, createFolder, createNote, listVault, listVaultFolder, openLocalWeeklyNote, readNote, readNoteIconCache, readVaultFavourites, readVaultListCache, restoreVault, saveNote, splitFrontmatter, writeNoteIconCache, writeVaultListCache, type LocalFolder, type LocalNote, type LocalVaultItem } from './localVault';
import { buildBrowserRows, expandPath } from './localVaultTree';
import { replaceVaultFolderChildren } from './localVaultCore';
import { noteIconFromMarkdown, resolveFavouriteNotes } from './vaultFeatures';
import { MOBILE_AUTOSAVE_DELAY_MS, shouldAutosave, type MobileEditorMode } from './autosave';

type OpenNote = { entry: LocalNote; frontmatter: string; body: string };

export default function App() {
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
  const [openingWeeklyNote, setOpeningWeeklyNote] = useState(false);
  const [active, setActive] = useState<OpenNote | null>(null);
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
  const [dismissRevision, setDismissRevision] = useState(0);
  const draftRef = useRef('');
  const originalRef = useRef('');
  const activeRef = useRef<OpenNote | null>(null);
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
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const task = (async () => {
      try {
        const snapshot = draftRef.current;
        await saveNote(note.entry.uri, originalRef.current, snapshot);
        originalRef.current = snapshot;
        setAutosaveBlockedRevision(null);
        setNoteIcons((previous) => ({ ...previous, [note.entry.path]: noteIconFromMarkdown(snapshot) }));
        setDirty(draftRef.current !== snapshot);
        return true;
      } catch (cause) {
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (draftRef.current === originalRef.current) return true;
      if (!await save()) return false;
    }
    if (draftRef.current === originalRef.current) return true;
    setError('The note kept changing while it was being saved. Please try again.');
    return false;
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
      setDirty(false);
      setError(null);
      setEditorFocused(false);
      setDismissRevision((value) => value + 1);
      Keyboard.dismiss();
    };
    if (draftRef.current === originalRef.current) { finish(); return; }
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

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (createVisible || searchVisible || settingsVisible) {
        setCreateVisible(false);
        setSearchVisible(false);
        setSettingsVisible(false);
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
      return false;
    });
    return () => subscription.remove();
  }, [closeNote, createVisible, editorFocused, keyboardVisible, searchVisible, settingsVisible]);

  const openNote = useCallback(async (entry: LocalNote) => {
    const request = ++openRequestRef.current;
    setOpeningNoteUri(entry.uri);
    setBusy(true);
    setError(null);
    try {
      const original = await readNote(entry.uri);
      if (request !== openRequestRef.current) return;
      const { frontmatter, body } = splitFrontmatter(original);
      const next = { entry, frontmatter, body };
      setNoteIcons((previous) => ({ ...previous, [entry.path]: noteIconFromMarkdown(original) }));
      originalRef.current = original;
      draftRef.current = original;
      draftModeRef.current = 'rich';
      draftRevisionRef.current = 0;
      activeRef.current = next;
      setActive(next);
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

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {active ? (
        <>
          <View style={styles.header}>
            <Pressable onPress={closeNote} style={styles.headerButton}><Text style={styles.headerAction}>‹ Notes</Text></Pressable>
            <Text style={styles.noteTitle} numberOfLines={1}>{active.entry.name.replace(/\.md$/i, '')}</Text>
            <Pressable onPress={() => { void save(); }} disabled={!dirty || saving} style={styles.headerButton}>
              <Text style={[styles.headerAction, (!dirty || saving) && styles.disabled]}>{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</Text>
            </Pressable>
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
                  <Search size={20} color="#293241" />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Open this week's note" onPress={() => { void openThisWeek(); }} disabled={busy || openingWeeklyNote} style={styles.iconButton}>
                  {openingWeeklyNote ? <ActivityIndicator size="small" color="#24577a" /> : <CalendarDays size={20} color={busy ? '#9aa3af' : '#293241'} />}
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => setSettingsVisible(true)} style={styles.iconButton}>
                  <Settings size={20} color="#293241" />
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
              <View style={styles.favouritesSection}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${favouritesExpanded ? 'Collapse' : 'Expand'} favourites`} onPress={() => setFavouritesExpanded((open) => !open)} style={styles.favouritesHeading}>
                  {favouritesExpanded ? <ChevronDown size={15} color="#697180" /> : <ChevronRight size={15} color="#697180" />}
                  <Text style={styles.sectionTitle}>Favourites</Text>
                </Pressable>
                {favouritesExpanded && (
                  <ScrollView style={styles.favouritesList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {favouriteNotes.length === 0 ? <Text style={styles.favouritesEmpty}>Favourite notes will appear here.</Text> : favouriteNotes.map((note) => (
                      <Pressable key={note.uri} accessibilityRole="button" accessibilityLabel={`Open favourite ${note.path}`} onPress={() => { void openNote(note); }} style={[styles.favouriteRow, note.uri === lastOpenedUri && styles.selectedRow]}>
                        <NoteIcon emoji={noteIcons[note.path]} />
                        <View style={styles.noteText}>
                          <Text style={styles.noteName} numberOfLines={1}>{note.name.replace(/\.md$/i, '')}</Text>
                        </View>
                        {note.uri === openingNoteUri && <ActivityIndicator size="small" color="#49627f" />}
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
              <View style={styles.filesHeading}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${filesExpanded ? 'Collapse' : 'Expand'} files`} onPress={() => setFilesExpanded((open) => !open)} style={styles.filesToggle}>
                  {filesExpanded ? <ChevronDown size={15} color="#697180" /> : <ChevronRight size={15} color="#697180" />}
                  <Text style={styles.filesTitle}>Files</Text>
                </Pressable>
                {(scanning || loadingFolders.size > 0) && <ActivityIndicator size="small" color="#49627f" />}
                <Pressable accessibilityRole="button" accessibilityLabel="New note in vault root" onPress={() => showCreate('note', null)} style={styles.sectionAction}>
                  <FilePlus2 size={18} color="#293241" />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="New folder in vault root" onPress={() => showCreate('folder', null)} style={styles.sectionAction}>
                  <FolderPlus size={18} color="#293241" />
                </Pressable>
              </View>
              {filesExpanded && <FlatList
                data={rows}
                keyExtractor={({ item }) => item.uri}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: row }) => row.item.kind === 'folder' ? (
                  <View style={[styles.treeRow, { paddingLeft: 14 + Math.min(row.depth, 10) * 16 }]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded.has(row.item.path) ? 'Collapse' : 'Expand'} ${row.item.name}`} onPress={() => toggleFolder(row.item as LocalFolder)} style={styles.folderToggle}>
                      {expanded.has(row.item.path) ? <ChevronDown size={17} color="#697180" /> : <ChevronRight size={17} color="#697180" />}
                      {expanded.has(row.item.path) ? <FolderOpen size={17} color="#49627f" /> : <Folder size={17} color="#49627f" />}
                      <Text style={styles.folderLabel} numberOfLines={1}>{row.item.name}</Text>
                      {loadingFolders.has(row.item.uri) && <ActivityIndicator size="small" color="#49627f" />}
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Folder actions for ${row.item.path}`} onPress={() => showFolderActions(row.item as LocalFolder)} style={styles.folderAdd}>
                      <MoreHorizontal size={19} color="#697180" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Open ${row.item.path}`} onPress={() => { void openNote(row.item as LocalNote); }} style={[styles.treeRow, row.item.uri === lastOpenedUri && styles.selectedRow, { paddingLeft: 14 + Math.min(row.depth, 10) * 16 }]}>
                    <NoteIcon emoji={noteIcons[row.item.path]} />
                    <View style={styles.noteText}>
                      <Text style={styles.noteName} numberOfLines={1}>{row.item.name.replace(/\.md$/i, '')}</Text>
                      {row.searchResult && <Text style={styles.notePath} numberOfLines={1}>{row.item.path}</Text>}
                    </View>
                    {row.item.uri === openingNoteUri && <ActivityIndicator size="small" color="#49627f" />}
                  </Pressable>
                )}
                ListEmptyComponent={!busy && loadingFolders.size === 0 ? <Text style={styles.empty}>No Markdown notes or folders found.</Text> : null}
              />}
            </>
          )}
        </>
      )}
      <Modal visible={searchVisible} transparent animationType="fade" onRequestClose={() => { setSearchVisible(false); setSearch(''); }}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setSearchVisible(false); setSearch(''); }}>
          <Pressable style={[styles.modalPanel, styles.searchPanel]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalTitleRow}>
              <Search size={20} color="#49627f" />
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                placeholder="Find notes"
                placeholderTextColor="#8a929e"
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                returnKeyType="search"
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={() => { setSearchVisible(false); setSearch(''); }} style={styles.iconButton}>
                <X size={20} color="#697180" />
              </Pressable>
            </View>
            <FlatList
              data={searchRows}
              keyExtractor={({ item }) => item.uri}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: row }) => (
                <Pressable style={styles.searchResult} onPress={() => { setSearchVisible(false); setSearch(''); void openNote(row.item as LocalNote); }}>
                  <NoteIcon emoji={noteIcons[row.item.path]} />
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
              placeholderTextColor="#8a929e"
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
              <Pressable accessibilityRole="button" accessibilityLabel="Close settings" onPress={() => setSettingsVisible(false)} style={styles.iconButton}><X size={20} color="#697180" /></Pressable>
            </View>
            <Pressable style={styles.menuItem} disabled={busy || scanning} onPress={() => { setSettingsVisible(false); if (vaultUri) void refresh(vaultUri); }}>
              <RefreshCw size={19} color={busy || scanning ? '#9aa3af' : '#293241'} />
              <Text style={[styles.menuItemText, (busy || scanning) && styles.disabled]}>Refresh vault</Text>
            </Pressable>
            <Pressable style={styles.menuItem} disabled={busy || pickerPending} onPress={() => { setSettingsVisible(false); void pickVault(); }}>
              <FolderOpen size={19} color={busy || pickerPending ? '#9aa3af' : '#293241'} />
              <Text style={[styles.menuItemText, (busy || pickerPending) && styles.disabled]}>Change vault folder</Text>
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
    </SafeAreaView>
  );
}

function NoteIcon({ emoji }: { emoji: string | null | undefined }) {
  return (
    <View style={styles.noteIcon}>
      {emoji ? <Text style={styles.noteEmoji}>{emoji}</Text> : <FileText size={17} color="#697180" />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: StatusBar.currentHeight ?? 0, backgroundColor: '#ffffff' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: '#dfe3ea', backgroundColor: '#ffffff' },
  title: { fontSize: 20, fontWeight: '700', color: '#202124' },
  noteTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#202124' },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconButton: { width: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  headerButton: { minWidth: 58, paddingVertical: 8 },
  headerAction: { color: '#24577a', fontSize: 15, fontWeight: '600' },
  disabled: { color: '#9aa3af' },
  error: { paddingHorizontal: 14, paddingVertical: 10, color: '#a14444', backgroundColor: '#fff1f0', borderBottomWidth: 1, borderColor: '#f2ceca' },
  editor: { flex: 1 },
  hiddenEditor: { display: 'none' },
  welcome: { padding: 24, gap: 20 },
  welcomeText: { fontSize: 16, lineHeight: 24, color: '#5f6673' },
  primaryButton: { alignSelf: 'flex-start', backgroundColor: '#24577a', borderRadius: 6, paddingHorizontal: 18, paddingVertical: 12 },
  primaryText: { color: 'white', fontSize: 16, fontWeight: '600' },
  input: { marginHorizontal: 12, marginTop: 10, minHeight: 44, borderWidth: 1, borderColor: '#dfe3ea', borderRadius: 7, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 9, color: '#202124', fontSize: 15 },
  filesHeading: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingHorizontal: 14 },
  filesToggle: { minHeight: 39, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  filesTitle: { color: '#5f6673', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionAction: { width: 34, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  favouritesSection: { marginTop: 12 },
  favouritesHeading: { minHeight: 39, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 5, backgroundColor: '#ffffff' },
  sectionTitle: { flex: 1, color: '#5f6673', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  favouritesList: { maxHeight: 210 },
  favouritesEmpty: { paddingHorizontal: 32, paddingBottom: 10, color: '#697180', fontSize: 13 },
  favouriteRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42, marginHorizontal: 10, paddingHorizontal: 6, borderRadius: 5 },
  treeRow: { flexDirection: 'row', alignItems: 'center', minHeight: 43, marginHorizontal: 8, paddingRight: 8, borderRadius: 5 },
  selectedRow: { backgroundColor: '#dfeaf2' },
  folderToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 43, gap: 8 },
  folderLabel: { flex: 1, color: '#303640', fontSize: 15, fontWeight: '600' },
  folderAdd: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noteIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  noteEmoji: { fontSize: 17, lineHeight: 21, textAlign: 'center' },
  noteText: { flex: 1, paddingVertical: 8 },
  noteName: { color: '#303640', fontSize: 15 },
  notePath: { color: '#697180', fontSize: 12, marginTop: 3 },
  empty: { padding: 18, color: '#697180' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#00000066' },
  modalPanel: { maxHeight: '82%', padding: 20, borderRadius: 10, backgroundColor: '#ffffff', shadowColor: '#0f1721', shadowOpacity: 0.2, shadowRadius: 24, elevation: 8 },
  searchPanel: { height: '72%', padding: 0, overflow: 'hidden' },
  modalTitleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8, borderBottomWidth: 1, borderColor: '#dfe3ea' },
  searchInput: { flex: 1, minHeight: 50, color: '#202124', fontSize: 16 },
  modalTitle: { color: '#202124', fontSize: 19, fontWeight: '700' },
  modalCopy: { marginTop: 6, color: '#697180', fontSize: 14 },
  modalInput: { marginHorizontal: 0, marginTop: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 6, backgroundColor: '#eef3f7' },
  secondaryButtonText: { color: '#293241', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  searchResult: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: '#edf0f4' },
  modalEmpty: { padding: 18, color: '#697180', textAlign: 'center' },
  settingsPanel: { marginTop: 'auto', marginBottom: 20, padding: 8, borderRadius: 10, backgroundColor: '#ffffff', shadowColor: '#0f1721', shadowOpacity: 0.2, shadowRadius: 24, elevation: 8 },
  settingsTitleRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10 },
  menuItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 6 },
  menuItemText: { color: '#303640', fontSize: 16 },
});
