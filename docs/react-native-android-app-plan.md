# React Native Android Companion App

Status: revised implementation proposal; Android implementation has not started.
Reviewed against the current source on 2026-09-10, including commit `68215ca`.

## Recommendation and changes to the original plan

Build an Expo/React Native application with native navigation, file browsing, authentication, storage, image picking and app chrome. Reuse the existing rich-text and Markdown editors inside a **locally bundled DOM editor surface**. Keep the website on Vite and share the editor, domain rules and synchronization controller through workspace packages. Both clients remain backend-free and store ordinary Markdown and `.web-notes.json` in Google Drive.

This changes the original all-native rendering proposal. The website now uses MDXEditor/Lexical as its default reading and editing surface, with substantial custom syntax, image, autocomplete, background-colour and block-movement behavior. Rebuilding those capabilities in a native renderer plus a multiline `TextInput` would duplicate the most difficult part of the application and deliver a materially different editor.

Expo supports React DOM components in a native WebView, including embedded bundles usable offline. That makes a shared editor a supported integration option; it does **not** establish that MDXEditor, Android keyboards and our drag interactions will work well without adaptation. Prove those in the first implementation gate. See [Expo DOM components](https://docs.expo.dev/guides/dom-components/) and [MDXEditor overview](https://mdxeditor.dev/editor/docs/overview).

The revised plan also:

- Replaces separate viewer/editor screens and explicit-only saves with in-place rich editing, autosave and a source-mode escape hatch.
- Adds images, upload/paste, image caching, Twemoji, slash commands, block colours and the latest type-preserving drag behavior.
- Separates recoverable drafts from disposable cache entries and defines a revision-aware save controller for Android process termination.
- Removes exact native text hit-testing from the critical path: the live DOM editor places the caret when text is tapped.
- Makes Expo, authentication and gesture versions prototype decisions instead of assuming a specific SDK or drag package works.
- Corrects offline parity: note/file writes require connectivity, but favourites already retain offline changes for later synchronization.

The older [WYSIWYG plan](wysiwyg-markdown-editor-plan.md) is historical context, not the current product specification. Its exclusions of autosave, images and viewer replacement have been superseded. Use current source and regression tests as the baseline; some README descriptions also lag implementation.

## Feature parity and mobile interaction

| Current capability | Android implementation |
| --- | --- |
| Cache-first tree; hidden files/folders omitted | Native library screen, retained cached tree during refresh and inline Files spinner |
| Collapsible favourites/files and favourite reordering | Matching sections, long-press reorder and accessible move controls; bound favourites height on small screens |
| Find notes searches names/paths; empty query shows recents | Native search screen/sheet using shared ranking; retain latest 25 recents locally |
| Extension-free names and first-visible-emoji icons | Same cached detection, ignoring frontmatter/formatting; never fetch unopened notes just for icons |
| Create, rename, delete and move notes/folders; image actions | Native sheets and destination picker; optimistic tree moves with scoped rollback; alphabetical ordering |
| Favourites in `.web-notes.json` | Same version-1 format, local shadow, silent synchronization and discoverable errors |
| Rich text is the default note surface | Shared MDXEditor with mobile layout, selection and touch adapters |
| Markdown source and compatibility fallback | Shared CodeMirror, subject to keyboard testing; native plain-text emergency fallback if the DOM surface fails |
| Formatting, lists/tasks, links, tables, quotes, code and thematic breaks | Shared plugins, keyboard accessory toolbar and overflow sheet |
| Wikilink, emoji and slash completion | Same detection, ranking and commands; touch-sized keyboard-safe suggestions |
| Block dragging and move/indent/outdent/delete menu | Touch handle adapter invoking existing Lexical operations |
| Hidden-comment background colours | Same nine colours, theme palette, Default removal and comment serialization |
| Twemoji artwork | Same Unicode Markdown and artwork/version/attribution; local assets for offline use |
| External/vault images, upload/paste and image viewer | Native picker/upload flow, authenticated image service, cache and full-screen image viewer |
| One-second rich autosave; continued editing during saves | Shared write controller, durable draft journal, newest revision queued behind each in-flight save |
| Properties, actions and sequential navigation | Fixed header/properties disclosure, compact previous/current/next controls |
| Toolbar/spelling indications hide after 10 seconds; Ctrl+S hides both | Shared activity state with Android-specific IME/spellcheck validation |
| Keyboard shortcuts and browser history | Hardware commands when Android delivers them; native Back and ID-based routes |
| Independent document/sidebar scrolling | Phone stack and tablet two-pane layout with explicit scroll ownership |

Keep sequential-note logic unchanged during extraction: take the **first numeric token in the filename**, replace matching complete numeric tokens throughout the path, and retain padding only when intentional. Reuse `noteSequence.test.ts`, including Week 9/10 and Week 20 in a 2021 path. Display the current number and disabled missing neighbours as on the website.

Browser-only features such as favicons, hover controls and desktop sidebar resizing need appropriate native equivalents, not literal duplication. App links and Android share-target integration can follow the first release.

## Architecture and sharing boundaries

Introduce npm workspaces incrementally:

```text
apps/
  web/                       Vite website and browser adapters
  android/                   Expo Router native shell/adapters
packages/
  core/                      Types, tree/search/settings/Markdown rules
  drive/                     Drive REST client and transport contracts
  sync/                      Refresh, durable drafts and write controller
  editor-dom/                MDXEditor, CodeMirror, plugins and editor CSS
  contracts/                 Auth/storage interfaces, host protocol, errors
  test-fixtures/             Markdown corpus, fake Drive, protocol fixtures
```

Native code imports core, drive, sync and contracts. `editor-dom` may depend on React DOM, Lexical, CodeMirror and browser APIs, but **must not enter the Hermes execution path**. The website and Android's DOM bundle import it separately. Authentication, durable persistence and network writes stay outside the editor.

Begin package extraction while the web app remains at repository root. Move it under `apps/web` in a dedicated later change, updating Vite base paths, environment loading, TypeScript, Playwright and both GitHub workflows. Keep root `dev`, `check`, `build` and browser-test commands forwarding to web. Do not copy `.env.local` values into committed mobile configuration.

### Source extraction map

| Existing source | Extraction/adaptation |
| --- | --- |
| `src/types/{drive,vault}.ts`, `vaultTree`, `noteSearch`, `noteSequence`, `vaultImages` | Core types, path resolution, ranking and sequence rules |
| `markdownEnvelope`, `blockBackground`, parsing and emoji detection | Core syntax/compatibility utilities; preserve frontmatter and line-ending behavior |
| `slashCommands`, `emojiCompletion`, `wikilinkCompletion`, `markdownFormatting` | Separate catalogs/ranking/detection/source operations from CodeMirror, localStorage and DOM events |
| `googleDrive.ts`, `vaultSettings.ts` | Drive/settings services with injected tokens, cancellation, binary/file transport and upload progress |
| `useVaultTree`, `useMarkdownFile`, `useVaultFavorites`, `VaultContext` | Tested refresh/mutation operations and state transitions in sync; platform-specific React providers |
| `MarkdownViewer.tsx` save queue/draft refs | Revision-aware controller owned above note routes, subscribed by account/vault/file |
| `vaultCache`, `imageCache`, `indexedDb` | Contracts and web adapter; SQLite/filesystem adapter runs equivalent behavior tests |
| `NoteEditorShell`, `RichMarkdownEditor`, rich plugins/nodes, `MarkdownEditor` | Shared DOM editor with injected host actions instead of web contexts/window events |
| `richBlockDrag.tsx` | Separate Lexical operations/menu availability from desktop drag registration |
| `ImageContext`, insert-image components | Image-service contract, native picker action and editor-side selection bookmarks |
| Spellcheck helpers, popovers, icons and editor CSS | Shared DOM behavior with explicit Android overrides/tests where needed |

Do not merge the legacy source-slice block mover with Lexical movement merely because both move blocks. The rich editor serializes its AST and may normalize Markdown body formatting after a real edit; the source mover has different preservation guarantees. Preserve the latest cross-list rich behavior: source list type, task state, numbering intent and subtree remain intact.

Select a stable Expo release and its compatible React/React Native versions during the prototype. Use a custom development build, Expo Router, SQLite, filesystem/image-picker APIs and native Lucide icons. Pin a tested set; keep Lexical packages aligned with MDXEditor. SQLite provides persistent database storage; image bytes belong in app-private files. See [SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/) and [ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/).

## Rich editor feasibility gate

Prototype an Expo DOM component hosting `editor-dom`. Keep direct `react-native-webview` with a dedicated bundled entry as a fallback if DOM bundling, origin controls or asset delivery need lower-level control. Neither option loads the deployed website: editor JavaScript, CSS and required assets ship with the application. See the [WebView guide](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md).

Require these demonstrations before building the full native UI:

1. MDXEditor and CodeMirror run in a release-like APK without Metro or internet; lazy chunks, CSS and asset paths resolve.
2. Gboard and Samsung Keyboard typing, composition, autocorrect, selections, copy/paste and undo work with long notes, nested tasks and code.
3. Keyboard resizing, rotation, text scaling and late image resolution preserve content, scroll and caret visibility.
4. The production plugin set passes the existing Markdown corpus, including linked/broken images, empty lists and background comments. Mounting or switching modes makes no saves.
5. Native sheets preserve editor selection; autocomplete, hardware shortcuts, toolbar and TalkBack work across the boundary.
6. Touch block movement does not intercept ordinary scrolling or selection; cancellation leaves content unchanged.
7. Bridge throughput and memory are acceptable for approximately 10 KB, 100 KB and 1 MB notes. Record initialization/typing timings on a named mid-range physical device and establish measured release budgets.

If basic typing or content fidelity fails, evaluate a native rich editor against the **same corpus**. It would need custom wikilink/background/image nodes, compatibility checks and block operations; it is a separate project, not a drop-in replacement. A raw-only interim build is not feature parity. The earlier native Markdown renderer and native exact-text-hit-testing component are deferred, not parallel implementation tracks.

### Host/editor protocol

Use a typed, runtime-validated and versioned protocol whether transport is Expo actions or WebView messages. Do not send DOM nodes, `Blob`s, bearer tokens or nested callback objects across it.

```ts
type NoteScope = { accountId: string; vaultId: string; fileId: string };
type EditorSession = NoteScope & { sessionId: string }; // new per load/mount
type EditorChange = EditorSession & {
  protocolVersion: 1;
  revision: number;          // monotonic within this session
  markdown: string;          // complete editable document
  origin: 'user';            // normalization has a separate event
};
```

Define ready/load/hydrated, user-change, draft-persisted acknowledgement, flush/snapshot, activity/focus, mode, error, navigation, image-request/result and accessible block-action messages. Requests/replies include session and request IDs. Discard stale, duplicate, wrong-account and out-of-order events. Distinguish a hydrated intentionally empty note from uninitialized content.

The editor owns selection, undo and IME composition. The native host owns durable drafts and Drive writes. Send initial Markdown once per session; do not echo every draft through MDXEditor's initial prop or call `setMarkdown` when a save succeeds. Remote replacement requires a clean draft or explicit conflict resolution. Persist revisions in order; a flush waits for acknowledgement of its latest snapshot.

Supply a compact note index for suggestions and update it only when metadata changes. Measure full-document change payload costs before throttling. If coalescing is needed, distinguish editor-local from durably stored changes and flush before navigation. Do not promise recovery of keystrokes that never reached storage.

Keep host actions narrow. Retain the Markdown allow-list, do not execute arbitrary HTML/JSX, validate message scopes, block top-level editor WebView navigation and open approved external links via Android. Resolve private images through native services without exposing tokens or arbitrary filesystem reads. Bundle assets under a constrained local origin instead of enabling broad file access.

## Editing and touch behavior

Opening a note displays rich text without automatically opening the keyboard; tapping text places the caret. Unsupported syntax selects source mode with the original full content and a concise notice. A WebView crash must allow recovery of the last durable draft into a native plain-text screen with save/copy/retry; that emergency screen need not reproduce all CodeMirror features.

Keep frontmatter outside rich editing and byte-for-byte intact, with the properties disclosure in the header. Source mode edits the full document. Initial normalization, image loading, resize, theme changes and restored-session mounting must never create user edits. Intentional empty content is valid after hydration; no new empty-note confirmation is needed.

Use a toolbar overlay/keyboard accessory with coordinated viewport insets, not a row that moves note content whenever focus changes. Put common formatting/list/task/link/image actions there and other operations in a sheet. Retain 10-second inactivity and explicit-save behavior where Android allows it; do not blur an active IME composition just to hide spelling marks. Keep an accessible reveal-toolbar action. Hardware Ctrl/Cmd+S saves, Ctrl+L makes/toggles a checklist, and standard formatting commands use the shared operation layer when delivered by Android.

Autocomplete preserves the current rules:

- `[[` uses recents/ranked notes and full paths; exclude embeds, code/frontmatter, aliases and heading targets. Insert extension-free vault-relative wikilinks, handling adjacent closing brackets.
- `:name` uses the shared emoji keyword list; require contiguous colon/name and the existing context checks.
- `/` works at a block start **or after whitespace mid-line**, but not within ordinary URLs/paths or code. Include headings, paragraph, quote, todo, bullet, numbered, image and background colours, including `grey` as an alias. Recent commands appear first.

Use a suggestion tray above the keyboard when caret popups are cramped. Touch selection must retain the editor range; Enter/arrows/Escape support external keyboards. Recents and command history remain device-local; favourites use the vault settings file.

### Block dragging and colours

Keep Pragmatic Drag and Drop for desktop DOM interactions. Do not assume its browser drag behavior works for Android touch. Implement a handle-only long-press/pointer adapter inside the DOM surface, with pointer capture after intentional activation and safe cancellation on lost capture, navigation or additional touches. Prevent scrolling only for activated handles, preserving ordinary document scrolling/selection.

Share Lexical move operations and rejection rules. Hit-test DOM block rectangles including the gutter, prioritize generous before/after zones and require deliberate horizontal intent for nesting. Highlight the effective target, dim the full source subtree and auto-scroll near viewport edges. Reject self/descendants/stale targets and show a preview without mutating content.

Preserve source bullet/numbered/task type across lists, checked state, child-list subtrees and continuation paragraphs/headings. Split destination list fragments where required. Test the same operations via gestures and Move up/down, Indent, Outdent and Delete actions. Accessible menu alternatives are required, but touch drag remains a parity milestone.

Keep the existing hidden-comment format: standalone `<!-- web-notes:background=green -->` for the next block; inline annotations for list items. Reuse the nine-colour palette and Default removal. Preserve colours on moves, avoid colour inheritance on Enter, and maintain highlight padding without adjacent-item overlap. No Android-only HTML formatting or storage syntax is introduced.

## Saving, recovery and synchronization

Extract one controller before integrating native saving. Scope all work by account/vault/file rather than file ID alone and own it above navigation. This hardens the existing component-owned queue; durable revision recovery is proposed work, not already implemented behavior.

Keep a confirmed Drive base separate from recoverable local state:

```ts
type DraftRecord = NoteScope & {
  sessionId: string;
  revision: number;
  content: string;
  baseModifiedTime?: string;
  updatedAt: number;
  state: 'dirty' | 'saving' | 'failed' | 'conflict';
};
```

1. Load confirmed content and any recovery draft; hydrate the right file before enabling mutations. Late responses must match account, vault, file and session.
2. Render genuine edits immediately and persist a revisioned draft. The visible cache can overlay an unverified draft, but retain the confirmed base separately. Ordinary eviction cannot delete recovery records.
3. After one second of rich inactivity, explicit Save, blur or controlled navigation, queue the newest durable snapshot. Finish IME composition before finalizing the snapshot. Preserve explicit source Save/Cancel; retain a departing source draft unless the user discards it.
4. Serialize note writes. Typing, tasks, dragging and colours remain enabled while a request is pending; coalesce subsequent changes into the newest pending snapshot.
5. Confirm only the submitted revision on Drive success. Update metadata without marking a newer draft confirmed or replacing it with the older response; write that newer revision next.
6. Preserve the latest draft on failure and show Retry/Reconnect. Distinguish auth, offline, permission/not-found and transient server errors; avoid infinite retries. Never roll back newer text or a different displayed note.
7. A remote update discovered alongside a draft preserves both versions and pauses conflicting autosave until the user chooses local overwrite or discard. Timestamp checks are not atomic compare-and-swap: another external write can still race. Do not promise conflict-free collaboration.
8. On Back/background, flush to durable storage first and attempt network save if available. Do not depend on unmount or background execution completing. After cold launch, identify the account, restore drafts, revalidate Drive and offer Resume/Retry for recovered writes.

No general offline note/file mutation queue is added. Cached data stays readable offline; newly initiated edits are disabled after connectivity loss, while already-entered text remains recoverable. Android can kill the app before a bridge/storage acknowledgement: measure and minimize that window, and do not show locally-saved status until the transaction commits. If draft storage fails, keep content in the editor, report it and offer copy/export before discarding or unsafe navigation.

Sign-out retains caches and recovery records, gated on identifying the same account again. Disconnect stops/drains or cancels scoped work and clears that account's drafts, caches and image files before completing session cleanup/revocation; handle pending drafts explicitly before destructive removal. Stale responses cannot recreate removed records. Coordinate rename/move/delete with pending saves so stale metadata cannot resurrect deleted nodes or old paths.

### Storage and refresh policy

Use validated SQLite records, migrations and compound account/vault/file keys:

| Store | Contents/policy |
| --- | --- |
| `vaults` | Complete tree, vault name and synchronized timestamp |
| `note_contents` | Confirmed Markdown and Drive modified time |
| `drafts` | Revisioned recovery records, excluded from cache eviction/pruning |
| `note_icons` | Emoji/null derived from opened notes only |
| `image_metadata` | File/version, MIME, size, local path and cache timestamps |
| `vault_settings` | Settings file ID, ordered favourites, dirty state and local revision |
| `preferences` | Scoped recents/vault selection; local theme/mode/command history |

Store image bytes in app-private files with a 100 MB default budget matching the website. Publish metadata only after successful temporary-file writes; clean orphaned files at startup and repair metadata when Android has evicted files. Account deletion removes both rows and files. Exclude private cache/recovery data from unintended Android backup. SQLite is not encrypted by default; document device/profile protection accurately.

Refresh on vault activation and reconnect, plus a coalesced Android foreground refresh so web edits become visible. Foreground refresh is a deliberate native addition, not timer polling or current web behavior. Avoid redundant refreshes from picker/keyboard transitions. Only a complete successful listing replaces the tree and prunes cached content; retain stale data on failure. Missing remote files with drafts need recovery UI, not silent deletion.

Download bodies/images lazily when absent or listed timestamps differ/are missing; deduplicate concurrent image requests. Reconcile selected nodes by ID after tree updates without replacing drafts. Cache failures remain non-fatal; draft-storage failures are visible.

Share `.web-notes.json` version 1 (`{ version: 1, favourites: string[] }`) without format changes. Preserve ordered IDs, silent synchronization and offline favourite changes; scope local shadows by account and vault during extraction. Serialize settings writes, re-read on reconnect and retain dirty state on failure. Whole-file synchronization is last-writer-wins across devices, not a conflict-free merge; stronger concurrent ordering would require a separate shared design.

## Images

Offer external HTTP/HTTPS URLs, existing vault images and a native device picker. Default uploads to the note's folder, preserve the 20 MB limit and collision suffixes, and use shared path escaping/resolution for inserted vault-root paths. Support existing relative/percent-encoded references and linked images. Never send Drive authorization to external image hosts.

Capture a session-scoped Lexical bookmark or CodeMirror range **before** opening a picker/paste flow. Map it through edits and insert only after Drive confirms upload. If the session/range is no longer valid, retain the uploaded file in the tree and request a new insertion position; never insert into another note or silently at offset zero. Cancel/failure leaves Markdown unchanged. Reconcile ambiguous upload timeouts before retrying to avoid duplicates; do not delete a successfully uploaded file merely because insertion was cancelled.

Deliver cached bytes through a tested constrained asset route or bridge transport: native file URIs are not automatically readable from the editor's WebView origin. Prove this in a release build, bound payload/memory usage, revoke temporary object URLs and avoid repeated multi-megabyte base64 props. Missing/unsupported images show retryable placeholders without blanking or dirtying the note.

Image clipboard support needs physical-device validation separately from native image picking. If WebView/IME delivery requires native content-URI or receive-content integration, implement a small adapter. Do not treat a text-only Markdown path as an uploaded image. Keep Insert image available for keyboards that do not expose clipboard image data.

The native image viewer includes filename, type, size, zoom/pan and rename/delete. Preserve extensions and update tree/cache metadata; renames/moves do not rewrite existing references. Bundle a versioned Twemoji asset set and attribution for offline use; display artwork without changing Unicode Markdown, clipboard content or accessibility labels.

## Authentication and native gestures

Use native Google authorization outside the editor. Prototype `@react-native-google-signin/google-signin`, recording the API variant, license, version and Expo config. Do not mix Original `getTokens` examples with newer Universal authorization methods. Google sign-in and authorization for Drive are distinct; an ID token cannot make Drive API requests. See [library API](https://react-native-google-signin.github.io/docs/api), [migration guidance](https://react-native-google-signin.github.io/docs/migrating) and [Android authorization](https://developer.android.com/identity/authorization).

Configure Android OAuth clients for the package and development/release/Play signing fingerprints. Test real-vault listing/upload, silent restoration, revoked permissions and account switching. Resolve `about.get(user.permissionId)` before exposing private cache. Let the SDK manage credentials and keep short-lived tokens out of SQLite, logs and the DOM bridge. Coalesce renewal; invalidate/reacquire once on auth failure. Never open interactive authorization in the background; cancellation preserves drafts.

Initially retain full Drive scope for arbitrary existing vaults. `drive.file` is per-file access and must not be assumed to recursively authorize an existing folder. Consider narrowing only after a proven selection/migration workflow. Full Drive access is restricted; plan OAuth verification and evaluate assessment obligations against actual data handling before release. See [Drive scope guidance](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

For native file/favourite dragging, prototype [Drax](https://github.com/nuclearpasta/react-native-drax) against the selected Expo/New Architecture versions, virtualized rows, variable heights, nested targets and edge scrolling. Keep it provisional; a Gesture Handler/Reanimated adapter is an alternative. Share core move validation with the accessible destination sheet. This native library choice is separate from DOM block gestures.

## Native layout

Phone routes are sign-in/account, vault picker, library, note and image. Route identity uses Drive ID plus account/vault scope. Search, favourites, tree, wikilinks and sequential controls share one navigation operation. Back restores library search, expansion and scroll state.

The library has fixed search/section controls and a file tree filling remaining height. Cap the favourites area on short screens so it cannot eliminate file browsing; allow its own scrolling past that cap. Flatten expanded tree rows for virtualization. Touch-sized actions and long-press sheets replace hover controls. The Move sheet lists full folder paths/root and rejects same-parent, self and descendants.

The note header is fixed: Back, stable-width save/sync status, compact sequence controls, rich/source icons and overflow. Move secondary controls into a sheet on narrow screens. Properties collapse beneath the app bar. Only the document scrolls: do not put the DOM editor inside another vertical native ScrollView. Coordinate keyboard/toolbar insets with its viewport.

Tablets use two panes based on available width, preserving the editor session through rotation and split-screen resizing. Validate TalkBack order, large fonts, at least 48 dp touch targets, contrast and reduced motion. Retain quick 0.1-second transitions without clipping menus at screen/keyboard boundaries.

## Detailed implementation phases

Each phase should be a reviewable change with an explicit exit condition. Do not build the full native UI before the editor/authentication gates pass.

### 0. Baseline and feasibility

- Turn the feature matrix into an acceptance checklist and promote existing rich regression cases into reusable fixtures.
- Build disposable editor/auth prototypes; test release assets, physical keyboards, TalkBack, touch drag, private image delivery and bridge recovery messages.
- Benchmark notes/tree sizes and record exact Expo/editor/auth/gesture versions, results and selected transport.
- Exit: offline bundled editing and real test-vault access work; initialization causes zero writes; critical typing/fidelity tests pass. Otherwise revise architecture first.

### 1. Workspaces and portable rules

- Add package exports, TypeScript references, dependency-boundary linting and shared fixtures.
- Extract types, tree/search/sequences, paths, settings, Markdown compatibility, backgrounds and command catalogs; remove browser globals from native-shared modules.
- Add transport/storage contracts and web adapters before moving the web app and updating CI/deployment paths.
- Exit: existing web unit/browser checks/build pass via root scripts; native imports cannot pull in DOM, IndexedDB or CodeMirror.

### 2. Shared draft/write controller

- Extract the component queue and introduce scoped revisions, confirmed bases, hydration gates and session cancellation.
- Integrate it on web first with an IndexedDB draft-store migration; preserve explicit source cancel and rich autosave behavior.
- Add deterministic delayed Drive, navigation, auth, deletion, storage-error and restart tests.
- Exit: old acknowledgements cannot overwrite new text, initial loads cannot save emptiness and pending edits survive route changes/recoverable restarts.

### 3. Android foundation and persistence

- Create Expo Router shell, themes, native auth/account identity, connectivity/AppState adapters and debug/release-like build configurations.
- Implement SQLite migrations, file cache, cleanup/backup policy and cache contract tests.
- Add recovery/status UI and fake Drive injection before real-vault development flows.
- Exit: sign-in, cached offline reopening, reconnect and correctly scoped draft restoration work on emulator and physical phone.

### 4. Library and navigation

- Build phone/tablet navigation, favourites/files/search/recents/icons and note/folder/image menus.
- Port optimistic mutations and rollback, silent favourites sync and accessible move/reorder sheets.
- Add native long-press gestures after sheet operations work; reconcile paths/IDs and outstanding writes.
- Exit: both clients browse/modify the same test vault, favourites sync and Back restores library state.

### 5. Production shared editor

- Extract `editor-dom`, replace web contexts with host actions and wire the versioned session protocol.
- Connect hydration, durable acknowledgements, autosave/status, source fallback, properties, sequence controls and conflict handling.
- Add keyboard-safe toolbar/suggestions, shortcuts, activity/spellcheck behavior and the full current syntax/plugin set.
- Exit: rich/source corpus passes through native host and shared save controller; mode changes/import/image resolution never save unsolicited changes.

### 6. Images and interaction parity

- Finish native picker/upload/progress, external/existing image insertion, bookmarks and clipboard/content-URI integration.
- Add authenticated cached rendering and native image viewer/actions.
- Complete touch block gestures, gutters, edge scrolling and action menus; verify cross-list types and background/Enter rules.
- Exit: image/drag scenarios work on physical devices, including while saving; failures retain note content and latest draft.

### 7. Hardening and release

- Run phone/tablet/TalkBack/font-scale/rotation, process-kill/low-storage, offline/auth, large-note and cross-client suites.
- Document local builds, signing fingerprints, fake-vault mode and diagnostics that exclude note contents/tokens.
- Add required mobile CI checks/APK artifacts, signed internal builds, icon/splash and attribution; complete privacy/OAuth/Play release requirements.
- Exit: all parity rows are checked, the release APK requires no development server, data-loss regressions pass and edits round-trip through both clients.

## Testing and verification

- **Pure and storage contracts:** Vitest for search/tree/sequences, compatibility, annotations, completions, settings and write-state transitions. Run equivalent cache behavior on web IndexedDB and real Android SQLite; mocks alone cannot validate native migrations/transactions.
- **Content corpus:** linked/broken/percent-encoded images, empty markers, tight/loose/mixed nested lists, numbered starts, tasks/subtrees/continuation paragraphs, tables, code, aliases, Unicode/Twemoji, frontmatter and LF/CRLF. Assert no-op byte preservation and semantic preservation after actual rich edits.
- **Save races:** edit B while A saves, fail A, queue C, navigate/account-switch/delete, receive stale refresh/bridge events, storage failure and process restart. Assert revisions/scopes/recovery, not only spinner state. Include intentional empty versus unhydrated notes.
- **Native component tests:** React Native Testing Library for screens, sheets, navigation, status and accessibility; protocol tests for malformed/stale messages and delayed acknowledgements.
- **Android end-to-end:** select Maestro or equivalent in Phase 0 with deterministic fake Drive; confirm WebView-aware interaction support. Cover keyboard editing, suggestions, menus/drag, task changes while saving, image insertion, recovery, reconnect and tablet rotation. Use physical devices for IME/clipboard and a test vault for real OAuth.
- **Web regression:** retain Playwright's fake-session/intercepted-Drive suite during every shared extraction. Desktop Chromium is not sufficient evidence for Android IME/file-origin behavior.
- **Cross-client:** web edit then Android foreground, Android edit then web reload, simultaneous favourite changes, selected-note/image rename/move and external-write conflict recovery. Confirm ordinary Markdown viewers still hide background comments and read the files.
- **CI:** lint/types/unit tests/web build/browser suite plus mobile type-check/bundle checks; emulator integration and release-like APK validation on relevant changes/release gates. Run whitespace checks throughout. Never put credentials, private notes or images in logs/artifacts.

## Scope and remaining uncertainties

The major risks are Android contenteditable/IME quality, touch block gestures, private-image delivery and durable recovery across the asynchronous bridge. Phase 0 must produce runnable evidence, not just package selections.

No backend, timer polling, general offline note editing, collaborative editor, complete vault-body prefetch, automatic link rewriting, cross-note block dragging or Android share target is included. Foreground refresh and recovery drafts are explicit mobile requirements that also motivate shared web hardening. A native-only rich editor remains an alternative if the DOM gate fails, with a revised implementation estimate and feature checklist.

Deliver in the phases above rather than one rewrite. Share editor behavior, syntax and tested save logic; keep native screens and gestures tailored to Android.
