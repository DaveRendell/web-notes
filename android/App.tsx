import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Keyboard, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import EditorSurface from './EditorSurface';
import { chooseVault, createFolder, createNote, displayNameFromSafUri, listVault, listVaultFolder, readNote, readVaultListCache, restoreVault, saveNote, splitFrontmatter, writeVaultListCache, type LocalFolder, type LocalNote, type LocalVaultItem } from './localVault';
import { buildBrowserRows, expandPath } from './localVaultTree';
import { replaceVaultFolderChildren } from './localVaultCore';

type OpenNote = { entry: LocalNote; frontmatter: string; body: string };

export default function App() {
  const [vaultUri, setVaultUri] = useState<string | null>(null);
  const [items, setItems] = useState<LocalVaultItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [createParent, setCreateParent] = useState<LocalFolder | null>(null);
  const [createKind, setCreateKind] = useState<'note' | 'folder'>('note');
  const [active, setActive] = useState<OpenNote | null>(null);
  const [editorNote, setEditorNote] = useState<OpenNote | null>(null);
  const [lastOpenedUri, setLastOpenedUri] = useState<string | null>(null);
  const [openingNoteUri, setOpeningNoteUri] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(true);
  const [pickerPending, setPickerPending] = useState(false);
  const [foldersScanned, setFoldersScanned] = useState(0);
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(() => new Set());
  const [indexComplete, setIndexComplete] = useState(false);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [dismissRevision, setDismissRevision] = useState(0);
  const draftRef = useRef('');
  const originalRef = useRef('');
  const activeRef = useRef<OpenNote | null>(null);
  const savingRef = useRef(false);
  const pickerPendingRef = useRef(false);
  const newNameRef = useRef<TextInput>(null);
  const vaultUriRef = useRef<string | null>(null);
  const vaultGenerationRef = useRef(0);
  const loadedFoldersRef = useRef(new Set<string>());
  const pendingFolderLoadsRef = useRef(new Map<string, Promise<void>>());
  const scanPendingRef = useRef(false);
  const searchIndexAttemptedRef = useRef(false);
  const treeRevisionRef = useRef(0);
  const activeSessionRef = useRef(0);
  const openRequestRef = useRef(0);

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
    setFoldersScanned(0);
    setError(null);
    const revision = treeRevisionRef.current;
    const generation = vaultGenerationRef.current;
    let lastProgressAt = 0;
    try {
      const nextItems = await listVault(uri, (_partialItems, count) => {
        const now = Date.now();
        if (now - lastProgressAt > 250) { setFoldersScanned(count); lastProgressAt = now; }
      });
      if (vaultUriRef.current !== uri || vaultGenerationRef.current !== generation) return;
      if (treeRevisionRef.current !== revision) {
        searchIndexAttemptedRef.current = false;
        return;
      }
      setItems(nextItems);
      setIndexComplete(true);
      loadedFoldersRef.current = new Set([uri, ...nextItems.filter((item) => item.kind === 'folder').map((item) => item.uri)]);
      treeRevisionRef.current += 1;
      setCreateParent((previous) => previous
        ? nextItems.find((item): item is LocalFolder => item.kind === 'folder' && item.uri === previous.uri) ?? null
        : null);
    }
    catch (cause) { if (vaultUriRef.current === uri && vaultGenerationRef.current === generation) setError(`Could not refresh the vault: ${String(cause)}`); }
    finally { scanPendingRef.current = false; setScanning(false); if (foreground) setBusy(false); }
  }, []);

  useEffect(() => {
    void restoreVault().then(async (uri) => {
      if (!uri) return;
      vaultGenerationRef.current += 1;
      vaultUriRef.current = uri;
      setVaultUri(uri);
      const cached = await readVaultListCache(uri);
      if (vaultUriRef.current !== uri) return;
      if (cached) { setItems(cached.items); setIndexComplete(cached.complete); }
      setCacheLoaded(true);
      await loadFolder(uri, '', true);
    }).catch(() => setError('Saved folder access has expired. Choose your vault again.'))
      .finally(() => setBusy(false));
  }, [loadFolder]);

  useEffect(() => {
    if (!vaultUri || !cacheLoaded) return;
    const timer = setTimeout(() => { void writeVaultListCache(vaultUri, items, indexComplete); }, 400);
    return () => clearTimeout(timer);
  }, [vaultUri, items, indexComplete, cacheLoaded]);

  useEffect(() => {
    if (!search.trim()) { searchIndexAttemptedRef.current = false; return; }
    if (vaultUri && search.trim() && !indexComplete && !scanning && !scanPendingRef.current && !searchIndexAttemptedRef.current) {
      searchIndexAttemptedRef.current = true;
      void refresh(vaultUri, false);
    }
  }, [vaultUri, search, indexComplete, scanning, refresh]);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setDismissRevision((value) => value + 1);
      setEditorFocused(false);
    });
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const note = activeRef.current;
    if (!note || savingRef.current) return false;
    if (draftRef.current === originalRef.current) return true;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const snapshot = draftRef.current;
      await saveNote(note.entry.uri, originalRef.current, snapshot);
      originalRef.current = snapshot;
      setDirty(draftRef.current !== snapshot);
      return true;
    } catch (cause) {
      setError(String(cause));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  const closeNote = useCallback(() => {
    if (savingRef.current) return;
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
    Alert.alert('Unsaved changes', 'Save this note before leaving?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: finish },
      { text: 'Save', onPress: () => { void save().then((ok) => { if (ok) finish(); }); } },
    ]);
  }, [save]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
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
  }, [closeNote, editorFocused, keyboardVisible]);

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
      originalRef.current = original;
      draftRef.current = original;
      activeRef.current = next;
      setActive(next);
      setEditorNote(next);
      setLastOpenedUri(entry.uri);
      setDirty(false);
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
      setLoadingFolders(new Set());
      treeRevisionRef.current += 1;
      setCacheLoaded(false);
      setIndexComplete(false);
      setVaultUri(uri);
      setItems([]);
      setExpanded(new Set());
      setCreateParent(null);
      setLastOpenedUri(null);
      setEditorNote(null);
      const cached = await readVaultListCache(uri);
      if (cached) { setItems(cached.items); setIndexComplete(cached.complete); }
      setCacheLoaded(true);
      await loadFolder(uri, '', true);
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
      setExpanded((previous) => expandPath(previous, parentPath));
      setSearch('');
      await loadFolder(parentUri, parentPath, true);
      if (entry.kind === 'note') await openNote(entry);
    } catch (cause) { setError(`Could not create ${createKind}: ${String(cause)}`); }
    finally { setBusy(false); }
  };

  const rows = useMemo(() => buildBrowserRows(items, expanded, search), [items, expanded, search]);
  const noteCount = useMemo(() => items.filter((item) => item.kind === 'note').length, [items]);
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
      <StatusBar barStyle="dark-content" backgroundColor="#f6f7f5" />
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
            {vaultUri && <Pressable onPress={() => { void refresh(vaultUri); }} disabled={busy || scanning} style={styles.headerButton}><Text style={[styles.headerAction, (busy || scanning) && styles.disabled]}>Refresh</Text></Pressable>}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          {!vaultUri ? (
            <View style={styles.welcome}>
              <Text style={styles.welcomeText}>Choose the folder where your notes are synced on this phone. Web Notes will only read and write inside that folder.</Text>
              <Pressable onPress={() => { void pickVault(); }} disabled={busy || pickerPending} style={styles.primaryButton}><Text style={styles.primaryText}>{pickerPending ? 'Waiting for folder picker…' : busy ? 'Checking saved folder…' : 'Choose vault folder'}</Text></Pressable>
            </View>
          ) : (
            <>
              <View style={styles.folderRow}>
                <Text style={styles.folderName} numberOfLines={1}>{displayNameFromSafUri(vaultUri)}</Text>
                <Pressable onPress={() => { void pickVault(); }} disabled={busy || pickerPending}><Text style={[styles.mutedAction, (busy || pickerPending) && styles.disabled]}>Change folder</Text></Pressable>
              </View>
              <TextInput style={styles.input} placeholder="Find notes" value={search} onChangeText={setSearch} autoCorrect={false} />
              <View style={styles.createHeading}>
                <Text style={styles.createTarget} numberOfLines={1}>New {createKind} in {createParent?.path ?? 'vault root'}</Text>
                {createParent && <Pressable onPress={() => setCreateParent(null)}><Text style={styles.mutedAction}>Use root</Text></Pressable>}
              </View>
              <View style={styles.createRow}>
                <TextInput ref={newNameRef} style={[styles.input, styles.createInput]} placeholder={createKind === 'note' ? 'New note name' : 'New folder name'} value={newName} onChangeText={setNewName} onSubmitEditing={() => { void addItem(); }} />
                <Pressable onPress={() => setCreateKind((kind) => kind === 'note' ? 'folder' : 'note')} style={styles.kindButton}><Text style={styles.mutedAction}>{createKind === 'note' ? 'Note' : 'Folder'}</Text></Pressable>
                <Pressable onPress={() => { void addItem(); }} disabled={!newName.trim() || busy} style={styles.smallButton}><Text style={styles.headerAction}>Create</Text></Pressable>
              </View>
              <Text style={styles.count}>{pickerPending ? 'Waiting for folder picker…' : scanning ? `Scanning folder ${foldersScanned + 1}… ${noteCount} notes indexed` : loadingFolders.size > 0 ? 'Loading folder…' : search ? `${rows.length} matching notes${indexComplete ? '' : ' (index incomplete)'}` : `${noteCount} ${indexComplete ? 'notes' : 'indexed notes'} · ${items.length - noteCount} folders`}</Text>
              <FlatList
                data={rows}
                keyExtractor={({ item }) => item.uri}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: row }) => row.item.kind === 'folder' ? (
                  <View style={[styles.treeRow, { paddingLeft: 14 + Math.min(row.depth, 10) * 16 }]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded.has(row.item.path) ? 'Collapse' : 'Expand'} ${row.item.name}`} onPress={() => toggleFolder(row.item as LocalFolder)} style={styles.folderToggle}>
                      <Text style={styles.chevron}>{expanded.has(row.item.path) ? '▾' : '▸'}</Text>
                      <Text style={styles.folderLabel} numberOfLines={1}>{row.item.name}</Text>
                      {loadingFolders.has(row.item.uri) && <Text style={styles.loadingLabel}>Loading…</Text>}
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Create in ${row.item.path}`} onPress={() => { setCreateParent(row.item as LocalFolder); newNameRef.current?.focus(); }} style={styles.folderAdd}>
                      <Text style={styles.mutedAction}>＋</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Open ${row.item.path}`} onPress={() => { void openNote(row.item as LocalNote); }} style={[styles.treeRow, row.item.uri === lastOpenedUri && styles.selectedRow, { paddingLeft: 14 + Math.min(row.depth, 10) * 16 }]}>
                    <Text style={styles.noteGlyph}>•</Text>
                    <View style={styles.noteText}>
                      <Text style={styles.noteName} numberOfLines={1}>{row.item.name.replace(/\.md$/i, '')}</Text>
                      {row.searchResult && <Text style={styles.notePath} numberOfLines={1}>{row.item.path}</Text>}
                    </View>
                    {row.item.uri === openingNoteUri && <Text style={styles.loadingLabel}>Opening…</Text>}
                  </Pressable>
                )}
                ListEmptyComponent={!busy && loadingFolders.size === 0 ? <Text style={styles.empty}>{search ? 'No matching notes.' : 'No Markdown notes or folders found.'}</Text> : null}
              />
            </>
          )}
        </>
      )}
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
            onDraftChange={async ({ markdown: body, session: draftSession }) => {
              if (draftSession !== activeSessionRef.current || activeRef.current?.entry.uri !== editorNote.entry.uri) return;
              const full = editorNote.frontmatter + body;
              draftRef.current = full;
              setDirty(full !== originalRef.current);
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: StatusBar.currentHeight ?? 0, backgroundColor: '#f6f7f5' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: '#d8ddd6' },
  title: { fontSize: 20, fontWeight: '700', color: '#19291d' },
  noteTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#19291d' },
  headerButton: { minWidth: 58, paddingVertical: 8 },
  headerAction: { color: '#286a43', fontSize: 15, fontWeight: '600' },
  disabled: { color: '#839087' },
  error: { padding: 10, color: '#9b2929', backgroundColor: '#fff0ed' },
  editor: { flex: 1 },
  hiddenEditor: { display: 'none' },
  welcome: { padding: 24, gap: 20 },
  welcomeText: { fontSize: 16, lineHeight: 24, color: '#394b3f' },
  primaryButton: { alignSelf: 'flex-start', backgroundColor: '#2d7048', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 },
  primaryText: { color: 'white', fontSize: 16, fontWeight: '600' },
  folderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12, gap: 10 },
  folderName: { flex: 1, color: '#425348', fontSize: 14 },
  mutedAction: { color: '#286a43', fontSize: 14 },
  input: { marginHorizontal: 12, marginTop: 10, borderRadius: 8, backgroundColor: '#e8ede7', paddingHorizontal: 12, paddingVertical: 9, color: '#19291d', fontSize: 15 },
  createHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  createTarget: { flex: 1, color: '#66736a', fontSize: 13 },
  createRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  createInput: { flex: 1 },
  smallButton: { paddingHorizontal: 10, paddingVertical: 10 },
  kindButton: { paddingHorizontal: 6, paddingVertical: 10 },
  count: { paddingHorizontal: 14, paddingVertical: 10, color: '#66736a', fontSize: 13 },
  treeRow: { flexDirection: 'row', alignItems: 'center', minHeight: 43, paddingRight: 10, borderTopWidth: 1, borderColor: '#e3e8e2' },
  selectedRow: { backgroundColor: '#e3eee5' },
  folderToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 43, gap: 8 },
  folderLabel: { flex: 1, color: '#263d2d', fontSize: 15, fontWeight: '600' },
  loadingLabel: { color: '#69786d', fontSize: 12 },
  chevron: { width: 16, color: '#64786b', fontSize: 18, textAlign: 'center' },
  folderAdd: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noteGlyph: { width: 24, color: '#758b79', fontSize: 20, textAlign: 'center' },
  noteText: { flex: 1, paddingVertical: 8 },
  noteName: { color: '#19291d', fontSize: 16 },
  notePath: { color: '#69786d', fontSize: 12, marginTop: 3 },
  empty: { padding: 18, color: '#69786d' },
});
