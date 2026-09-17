# Android local-vault prototype

This Expo app now opens a phone-local synced vault through Android's folder picker. It shows a collapsible folder browser (including empty folders), searches note paths, opens Markdown notes in the validated rich/source editor, creates notes and folders in the vault root or a chosen folder, and saves back to the selected folder. It does not connect to Google Drive. The earlier editor-feasibility diagnostics remain in the source but are not the app's current home screen.

Choose the actual vault folder (not the phone's storage root). Android grants persistent read/write access to that folder and its descendants. If the sync app stores its notes under another app's private `Android/data` folder, Android's folder picker may not allow access; configure the sync app to use a user-accessible Documents folder instead. The selected folder is remembered locally. Use **Refresh** after another app syncs files into the vault.

Saving is explicit for this first pass. The app checks the file's current bytes against the version opened before overwriting it. If another app changed the note, the save is refused and the draft stays open. There is no background save, sync queue, image loading, calendar connection, or background change subscription yet. Frontmatter is preserved verbatim but not editable in rich mode; source mode currently edits the body only.

The file browser displays a locally cached listing immediately, refreshes the vault root on launch, and reads subfolders when expanded. A small local Android module queries each folder's IDs, display names, and types in one document-provider cursor instead of checking every child separately. If that module is unavailable or its query fails, the app falls back to Expo's directory listing. Searching an incomplete listing builds a full index in the background; **Refresh** also rescans the whole vault. These listings can be briefly stale after another app syncs files. The cache is only an index: note contents are still read from the selected folder and saves still check for external changes. Expo's general `getInfoAsync` cannot reliably inspect document-provider folders, so note sizes are not shown in this first pass. The folder picker is disabled while a permission request or foreground refresh is pending.

## Run

From this directory:

```sh
npm ci
npm run typecheck
npm run bundle
npm run android
```

`npm run bundle` exports the Android Hermes bundle and a locally embedded DOM editor bundle to ignored `dist/`. It sets `EXPO_NO_BUNDLE_SPLITTING=1`: with Expo SDK 57.0.23, the split-chunk export currently fails here with `Asset not found: _expo/static/js/web/__common-…js`. The unsplit export succeeds and includes editor JavaScript and CSS. Re-test that workaround when changing Expo versions.

To reproduce the debug-signed release variant without installing it on a device:

```sh
npx expo prebuild --platform android --no-install
cd android
EXPO_NO_BUNDLE_SPLITTING=1 ./gradlew assembleRelease --no-daemon
```

The artifact is `android/app/build/outputs/apk/release/app-release.apk`. The APK contains the native bundle and local DOM HTML, CSS and JavaScript. The generated `android/` tree and APK are ignored.

The native shell reads and writes via Expo's legacy Storage Access Framework API. The DOM editor stays mounted between notes to avoid restarting its WebView. It uses MDXEditor 4.2.3 and CodeMirror, with Markdown changes sent to the native shell. It still imports the website's wikilink/emoji/image, background-colour and calendar Markdown plugins; vault images and calendar events currently use fake local services. Rich import falls back to Markdown mode if it changes the note's meaning. Touch block dragging remains available when the caret and keyboard are hidden. The app is not yet a complete replacement for the web client: it lacks favourites, images, Calendar data, block action menu, and durable recovery for drafts after process termination.

Colon emoji syntax such as `:smile:` is an *autocomplete trigger*, not a stored Markdown shortcode. To test it, place the cursor in text, type `:smi`, and check that the suggestion inserts a Unicode emoji. The corpus uses an actual emoji character for static rendering.

After installation, choose a small test vault first. Expand/collapse nested folders, confirm empty folders are shown, and search for a note by title or path. Use a folder's ＋ button to choose the destination for a new note or folder. Open a note, edit, save, and verify the synced file changed. Then edit the same file from another app before pressing Save here; the conflict warning should prevent an overwrite. Check Back with an unsaved edit (Save/Discard/Cancel), creating notes and folders in the root and a nested folder, refreshing after sync, and long-press dragging. Use a copied vault rather than irreplaceable notes for the first write test.
