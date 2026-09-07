# React Native Android Companion App

## Summary

Build a native Android companion app for Web Notes using Expo and React Native. The mobile app should provide the same core functionality as the website while using phone- and tablet-appropriate navigation, menus, editing controls, and drag interactions.

The app should be a native companion rather than a WebView wrapper. Google Drive access, cache rules, search, Markdown parsing, and source transformations can be shared. Authentication, storage, navigation, rendering, editing, and drag-and-drop require platform-specific adapters or components.

## Recommended Foundation

Use:

- Expo SDK 57 with TypeScript and Expo Router.
- A custom Expo development build rather than Expo Go.
- `@react-native-google-signin/google-signin` for native Google authentication.
- `expo-sqlite` for the vault and note cache.
- `expo-network` for connectivity events.
- `react-native-drax`, subject to a prototype, for favourites, file-tree, and Markdown-block drag-and-drop.
- `lucide-react-native` to retain the current icon language.
- The existing Unified/MDAST Markdown parser and transformations, with a purpose-built React Native renderer.

Expo Router provides native stack navigation and platform-specific layouts, while SQLite provides durable storage across app restarts. See [Expo Router](https://docs.expo.dev/router/introduction/) and [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/).

Keep the mobile app in the same repository and convert it into an npm-workspaces monorepo:

```text
apps/
  web/                  Existing Vite app
  mobile/               Expo React Native app
packages/
  core/                 Vault and Markdown business logic
  drive/                Google Drive REST client
  cache/                Cache types and interfaces
  test-fixtures/         Shared Markdown and vault fixtures
```

The web app should remain a Vite app. Rebuilding it with React Native Web would create substantial churn without materially improving code sharing.

## Shared Logic

The following existing code is already portable or can be made portable with relatively small changes:

- Drive file types and vault node types.
- Google Drive REST requests.
- Vault construction, sorting, searching, path rebasing, and sequential-note navigation.
- Frontmatter parsing and emoji-icon detection.
- Note search ranking and recent-note rules.
- `.web-notes.json` parsing and favourites synchronization.
- Markdown task-checkbox operations.
- Markdown block parsing, moving, nesting, outdenting, and deletion.
- Most autocomplete detection, ranking, and insertion logic.
- Cache record types and synchronization rules.
- Optimistic mutation and conflict-handling rules.

Some existing utilities need separating from their web framework:

- Formatting functions currently operate directly on CodeMirror. Extract pure functions accepting Markdown plus a UTF-16 selection and returning updated Markdown plus the new selection.
- Wikilink and emoji completion should expose pure “find completion at cursor” functions, with thin CodeMirror and React Native adapters.
- The Drive client should accept injected `fetch`, UUID, and abort implementations rather than directly using browser globals.
- `VaultContext` should be split into platform-neutral reducers/use cases and platform-specific React providers.
- Cache functions should target a `VaultCache` interface rather than IndexedDB directly.

For example:

```ts
interface VaultCache {
  getVaultTree(accountId: string, vaultId: string): Promise<CachedVault | null>;
  putVaultTree(record: CachedVault): Promise<void>;
  getNoteContent(scope: NoteScope): Promise<CachedNote | null>;
  putNoteContent(record: CachedNote): Promise<void>;
  deleteMissingNotes(scope: VaultScope, validIds: Set<string>): Promise<void>;
  deleteAccount(accountId: string): Promise<void>;
}

interface AuthSession {
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  disconnect(): Promise<void>;
}
```

IndexedDB would implement the cache interface on the web and SQLite would implement it on Android.

## Authentication

Create a separate Android OAuth client in the existing Google Cloud project, associated with the Android package name and the SHA fingerprints of the development and Play signing certificates.

The native auth adapter should:

1. Sign in using Google’s native account chooser.
2. Request the existing Drive scope.
3. Retrieve a short-lived access token when needed.
4. Use silent sign-in/token retrieval on subsequent launches.
5. On a Drive `401`, clear the cached access token and retry once.
6. Show interactive authorization only if the saved Google credential or Drive grant is unavailable.
7. Continue using `about.get(user.permissionId)` as the stable cache account ID.
8. Let the Google SDK own the saved credential; do not persist raw access tokens in SQLite.

The native Google library supports additional API scopes, silent sign-in, token retrieval, sign-out, and revocation. See the [React Native Google Sign-In API](https://react-native-google-signin.github.io/docs/api).

The current full `drive` scope is classified as restricted. A public Play release will require OAuth verification, although note-taking apps are an accepted category. Because data remains on-device and is not transmitted to a backend, the additional server-data security assessment should normally not apply, but verification still does. See [Google Drive scope guidance](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Before release, separately investigate whether a Picker-based `drive.file` flow can grant sufficient access to an existing vault and all its descendants. It would be preferable from a privacy and verification perspective, but should not replace the full scope unless real-vault traversal and editing are proven to work.

## Mobile Layout

### Phones

Use a native stack containing:

- Sign in.
- Choose vault.
- Notes/library.
- Note viewer.
- Note editor.

The notes screen should replace the desktop sidebar:

- Fixed, collapsible favourites section at the top.
- Find-notes field beneath it, showing recent notes while empty.
- File tree occupying and scrolling through the remaining space.
- Root note/folder creation in the Files heading or a small floating action menu.
- Folder expansion inline.
- Per-item actions through an overflow menu or long press.
- Selecting a note pushes a full-screen viewer.

The viewer should have:

- A fixed top app bar.
- Back button.
- Save spinner and error state.
- Sequential-note controls aligned right where space permits.
- Edit and note actions in its overflow menu.
- A compact metadata/properties disclosure beneath the app bar.
- Only the note body scrolling.

The editor should be full-screen with a formatting toolbar fixed immediately above the software keyboard.

### Tablets

At an appropriate width, switch to a two-pane layout:

- Favourites and files on the left.
- Viewer/editor on the right.
- Preserve the current selected-note state when switching orientation.
- Consider adjustable pane width after the base layout is stable.

Native menus and bottom sheets should replace desktop popovers. Hover-only controls become always-visible touch targets or appear after selecting or long-pressing a row.

## Markdown Viewer

Build a React Native renderer around the existing MDAST model rather than adopting a renderer with a separate Markdown parser. This is more work initially, but preserves:

- Existing frontmatter behaviour.
- Wikilinks.
- Exact source ranges.
- Current list-spacing decisions.
- Task-checkbox source positions.
- Emoji extraction.
- Semantic block IDs and drag handles.
- Byte-preserving block transformations.

Render headings, paragraphs, lists, quotes, links, code, tables, and thematic breaks as native components. Tables and code blocks can scroll horizontally.

`react-native-enriched-markdown` is worth using as a benchmark or fallback: it has native GFM rendering, task-list callbacks, links, selection, and a Markdown-producing editor. However, using it as one opaque document view would make source-mapped click editing and per-block grabbers difficult. Its editor may also normalize Markdown rather than preserving the exact original source. See [Enriched Markdown](https://github.com/software-mansion/enriched-markdown).

## Editor

Start with a controlled multiline React Native `TextInput` containing raw Markdown. It naturally provides UTF-16 cursor and selection offsets compatible with the shared transformations.

Implement:

- Word wrap.
- Dark-mode cursor and selection colours.
- Bold, italic, strikethrough, checklist, ordered list, unordered list, and link actions.
- Hardware-keyboard shortcuts where Android exposes them.
- Save action in the app bar and keyboard toolbar.
- Draft preservation and remote-update warnings.
- Optimistic return to view mode while Drive saves.
- Wikilink and emoji suggestions in a tray above the keyboard rather than trying to place a small popup over the caret.
- Recent notes after `[[` and ranked matches after text is entered.
- Existing colon/space rules for emoji suggestions.

As a polish spike, evaluate `@expensify/react-native-live-markdown`. It is a raw-text `TextInput` replacement with native syntax styling, but it supports only selected React Native versions and requires the New Architecture and a custom development build. Do not make it foundational until large notes, Android IME behaviour, selection preservation, and custom Markdown syntax have been tested. See [React Native Live Markdown](https://github.com/Expensify/react-native-live-markdown).

## Click-to-Edit

This is the least straightforward feature to reproduce exactly.

A JavaScript-only version can open the editor at the selected block or source-mapped word. React Native does not expose an exact character offset for a tap inside an ordinary rendered `Text` component.

For exact Android parity, add a small native text hit-testing component:

1. Render each block with a mapping between visible UTF-16 offsets and Markdown source offsets.
2. On tap, use Android `TextView.Layout` to determine the tapped line and character offset.
3. Convert that through the source map.
4. Push the editor screen and set its selection.
5. Ignore taps on links, checkboxes, grabbers, and active text selections.

This is feasible and contained, but it should be prototyped early. If the native component proves disproportionate, the mobile-friendly fallback is opening the editor at the beginning of the tapped word or block, after which the user can place the caret precisely.

## Drag-and-Drop

Atlaskit’s current drag-and-drop package is DOM-only and cannot be shared. The pure move validation and Markdown transformations can be shared, while React Native provides the gestures.

Prototype `react-native-drax` because it supports arbitrary receivers, handles, acceptance rules, sortable lists, and drag-aware scrolling rather than only flat-list reordering. See [React Native Drax](https://github.com/nuclearpasta/react-native-drax).

Use it for:

- Long-press dragging to reorder favourites.
- Dragging notes or folders onto folders.
- A temporary “Vault root” target.
- Disabled self, current-parent, and descendant destinations.
- Markdown before, after, nest, and outdent targets.
- Edge auto-scroll.
- Dragging a list item with its complete subtree.

Retain accessible non-drag alternatives:

- “Move to…” bottom sheet for files and folders.
- Move up, move down, indent, outdent, and delete actions in the block menu.
- Reorder controls for favourites when a screen reader is active.

The shared pure operations remain the source of truth; the native drag layer only produces operations such as `{ sourceId, targetId, placement }`.

## Cache and Synchronization

Mirror the current cache-first behaviour in SQLite:

```text
vaults
  account_id, vault_id, name, tree_json, synced_at

note_contents
  account_id, vault_id, file_id, content, modified_time, cached_at

note_icons
  account_id, vault_id, file_id, emoji, cached_at

app_state
  selected_vault, recent_note_ids, favourite_shadow, dirty_flags
```

Use compound primary keys and transactions. Cache errors remain non-fatal.

Behaviour should match the website:

- Display the cached tree immediately.
- Refresh the listing after sign-in, vault activation, network reconnection, and returning to the foreground.
- Load note bodies lazily.
- Skip downloads when `modifiedTime` matches.
- Update the cache optimistically for saves, task toggles, block changes, moves, renames, creation, and deletion.
- Keep cached data read-only offline.
- Preserve unsaved drafts if Drive has changed.
- Sync favourites through `.web-notes.json`.
- Sign out retains cache; Disconnect removes the selected account’s cache.

Foreground refresh is preferable to timer polling. True Drive push notifications would still require a public webhook and backend.

## Implementation Phases

### 1. Technical Spikes

- Native Google sign-in and silent token refresh against a real vault.
- Unified, YAML, and `emojilib` compatibility under Hermes.
- Large-note `TextInput` performance and Android IME handling.
- Drax variable-height targets, nesting, and auto-scroll.
- Exact Android text hit-testing.

### 2. Repository and Shared Core

- Introduce npm workspaces.
- Move the Vite app under `apps/web`.
- Extract types, pure Markdown logic, tree operations, search, Drive client, and cache contracts.
- Keep web behaviour and tests unchanged.

### 3. Mobile Foundation

- Create the Expo app and navigation.
- Add theme, network, authentication, SQLite migrations, and error handling.
- Add development and release Android configurations.

### 4. Vault Browsing

- Sign-in and vault picker.
- Cache-first tree.
- Favourites, Files, recent-note search, and emoji icons.
- Create, rename, delete, favourite, and move operations.

### 5. Viewer

- Native Markdown rendering.
- Frontmatter properties.
- Wikilinks and external links.
- Task toggles, sequence navigation, note actions, and save status.
- Block model and source mapping.

### 6. Editor

- Raw Markdown editing and formatting.
- Wikilink and emoji completion.
- Optimistic saving, auth recovery, conflicts, and draft protection.
- Click-to-edit integration.

### 7. Drag-and-Drop Parity

- Favourites.
- File and folder organization.
- Markdown block movement and accessible action menus.

### 8. Release Hardening

- Tablet layout, accessibility, font scaling, rotation, and process restoration.
- OAuth verification, privacy policy, and Play Data Safety declaration.
- Internal Play testing followed by production release.

## Testing

- Continue running all pure shared tests under Vitest.
- Run the same fixtures against IndexedDB and SQLite cache implementations.
- Add React Native Testing Library tests for screens and interactions.
- Add Android integration tests for the native click-offset component.
- Add Maestro end-to-end flows for sign-in, vault selection, editing, autocomplete, optimistic saving, task toggling, file moves, block moves, offline cached viewing, and auth expiry.
- Smoke-test release builds on a physical phone and tablet-sized emulator.
- Make web tests, mobile tests, lint, type-checking, and both production builds required in CI.

## Risks and Assumptions

- The main technical risks are exact Markdown rendering/source mapping, the editor experience, and nested block drag-and-drop. Drive access and cache synchronization should port comparatively cleanly.
- The Android app remains backend-free and read-only while offline; queued offline writes remain out of scope.
- Mobile interactions may differ from the website where touch conventions require it, but the underlying operations and outcomes should remain equivalent.
- Android is the initial target, but the shared packages and Expo foundation should avoid unnecessary Android-only assumptions outside the exact text hit-testing component and release configuration.
- Library choices that affect core interactions must pass the technical spikes before becoming architectural dependencies.

