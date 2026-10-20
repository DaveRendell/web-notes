# Android app

This Expo app opens a vault directly from Google Drive. Its mobile sidebar mirrors the web app with SVG file and action icons, collapsible favourites/files, modal search and creation, a settings menu, and a weekly-note shortcut. It opens Markdown notes in the validated rich/source editor. No phone filesystem sync app or Android folder permission is needed. The earlier filesystem adapter and feasibility diagnostics remain as test/reference code, not the active storage backend.

Tap **Choose Drive vault**, sign into Google, navigate through Drive folders and select your vault. The account and selected Drive folder are remembered. The same account is used for Calendar; calendar permissions are requested separately when connecting a widget. The chooser currently browses My Drive, including shared folders placed there; a dedicated shared-drive browser is not included.

Rich-text changes autosave after 350 ms of inactivity and are flushed when leaving the note or backgrounding the app. Markdown-source mode retains the explicit Save action. A durable account/vault-scoped write queue is saved to app-private storage **before** each Drive request; successive offline edits coalesce while preserving the original remote baseline. Writes are serialized. The queue retries when connectivity returns, when the app becomes active, or with Settings → **Sync local changes**. Android does not keep syncing after the app is terminated: queued changes resume on the next launch. Never uninstall or clear app data before pending changes sync.

Before uploading, the app checks Drive's version and, if needed, the current file contents. A remote change produces a conflict instead of an automatic overwrite; the local version remains durable and readable. Note actions → **Resolve conflict: use local version** allows an explicitly confirmed overwrite. Already-committed snapshots are recognised on retry. Storage failures are never reported as successful offline saves. Offline note editing is supported for cached notes; creation, image uploads and uncached content still require connectivity. Frontmatter is preserved verbatim but not editable in rich mode; source mode currently edits the body only.

The file browser displays the cached tree immediately and refreshes the complete recursive Drive listing in the background. Up to six independent folders are listed concurrently. Cached files stay visible on refresh failure. Notes are cached lazily: matching `modifiedTime` values avoid content downloads; stale cached text appears immediately while the newer body downloads. Refreshes never replace an unsaved draft. Images and favourite settings are also cached. Body pruning occurs only after a complete successful listing and excludes pending edits. Locally edited notes deleted on Drive remain visible for recovery.

Background reconnection refreshes run only on an offline-to-online transition or when returning to the foreground. Repeated Android network-capability notifications do not rescan the vault, and overlapping reconnect/foreground requests share the pending sync and refresh.

The browser header stays fixed above a shared scroll area containing the weekly note, favourites and files. Favourites have no separate height cap or scrollbar; file rows remain virtualized for large vaults.

`driveVault.ts` adapts the existing mobile UI to the shared web Drive API helpers. `mobileCache.ts` provides versioned promise-based native storage with serialized atomic file replacement; IndexedDB is not available to native React Native. Cache keys include Drive `permissionId`, vault ID and file ID. The selected account is checked before accessing a cache. Tokens stay in the Google Sign-In SDK, not the cache; a 401 invalidates the SDK token and retries once. Cache/quota failures are nonfatal for disposable data, but propagate for queued drafts. App-private cache contents are not separately encrypted.

The file browser shows the first visible emoji of a note as its icon after that note has been opened. Icons are cached on the phone per vault; unopened notes use a generic note icon. Favourites read ordered Drive IDs from `.web-notes.json` and resolve them against the current tree, preserving order after moves and renames. Paths are neither stored nor used as a fallback. Missing notes are omitted from display without discarding their saved IDs. Favourites are still read-only in the current mobile UI.

The calendar button opens or creates `Weeks/YYYY/Week N YYYY.md`. New weekly notes use `Templates/Week.md` when present and replace `$week`, `$year`, `$monday`, and `$sunday`, matching the web app.

## Run

The editor currently imports some shared Markdown plugins directly from `web/src` into its DOM bundle. Those imports do not enter the native/Hermes entry; extracting them into a dedicated package is future work.

From the `android/` directory:

```sh
npm ci
npm run typecheck
npm test
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

The native shell reads and writes through the shared Drive helpers, with app-private filesystem storage for caches and queued saves. The DOM editor stays mounted between notes to avoid restarting its WebView. It uses MDXEditor 4.2.3 and CodeMirror, with Markdown changes sent to the native shell. It imports the website's wikilink/emoji/image, background-colour and calendar Markdown plugins. Vault image bytes and Google Calendar requests cross a narrow native-to-DOM bridge; Google access tokens remain on the native side. Rich import falls back to Markdown mode if it changes the note's meaning. Touch block dragging remains available when the caret and keyboard are hidden. The app is not yet a complete replacement for the web client: it lacks favourite editing, image rename/delete, and the block action menu. Drafts acknowledged by autosave are durable; changes made before the autosave delay elapses can still be lost if the process is abruptly terminated.

Colon emoji syntax such as `:smile:` is an *autocomplete trigger*, not a stored Markdown shortcode. To test it, place the cursor in text, type `:smi`, and check that the suggestion inserts a Unicode emoji. The corpus uses an actual emoji character for static rendering.

Typing `/` after whitespace in rich-text or Markdown mode opens slash commands. The mobile menu supports text/heading/quote conversions, to-do/bulleted/numbered lists, block background colours, images, and Calendar widgets; recently used commands rise to the top. Tap a suggestion or use keyboard arrows and Enter. Image and Calendar insertion controls also appear in the rich editor toolbar once editing begins. Images may be external URLs, existing vault files, pasted files, or uploads from Android's picker. Uploaded images are stored beside the current note.

## Google Drive and Calendar setup

Native Google Sign-In requests full Drive access for the pre-existing vault, with Calendar event/list read access requested when connecting Calendar. Widget comments use the same date range, timezone, and per-widget calendar IDs as the web app, including shared calendars.

In the Google Cloud project used by Web Notes:

1. Enable Google Drive API and Google Calendar API. Add `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/calendar.events.readonly` and `https://www.googleapis.com/auth/calendar.calendarlist.readonly` to Google Auth Platform → Data Access. Add your account as a test user when the project is in Testing.
2. Create an Android OAuth client for package `dev.webnotes.editorgate`.
3. Add the SHA-1 fingerprint of the signing certificate. The current local release build uses the checked-in debug key: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.
4. Add separate Android clients for any future production signing keys. A web client ID is not required by the app because it does not request offline/server access.

The first vault connection opens native Google consent; subsequent launches restore the account silently when possible. Use **Reconnect Google Drive** in Settings or the note menu if permissions expire; this preserves the current draft. No backend, client secret or web client ID is needed. Changing accounts requires choosing a vault again; caches from another account are not shown, and queued writes never use a different account's token.

After installing a rebuilt APK (required for the new network-state module), choose a copied test vault first. Check cached launch, folder expansion, title/path search, images, weekly templates and shared favourites. Open a note, switch to airplane mode, edit, close/reopen and restart the app: the local edits must survive. Reconnect and check Drive receives the latest snapshot. Repeat with a remote edit while offline: verify the conflict preserves the local version and requires explicit overwrite. Verify a second unrelated queued note still syncs. Check failed refreshes retain files, account switching isolates caches, and image uploads/create actions fail clearly offline. Real Google OAuth/Drive behaviour still requires device testing; unit tests do not grant permissions or write to a real account.
