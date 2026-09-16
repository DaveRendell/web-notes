# Android Phase 0 validation log

Status: in progress, 2026-09-16. This records evidence for the [Android companion plan](react-native-android-app-plan.md), not an approval to begin the full native UI. The [isolated editor prototype](../prototypes/android-editor/README.md) has had an initial physical-device rendering pass; critical fidelity checks remain open.

## First-pass baseline

- A synthetic, non-private Markdown corpus now lives in `src/test/richMarkdownCorpus.ts`. It covers frontmatter/CRLF, emoji, wikilinks/aliases, external links, broken and linked vault images, mixed nested/tasks/empty lists, tables, quotes, code, background comments and a multi-calendar widget. Extend this one corpus for native editor fidelity; do not copy private vault notes into fixtures.
- `RichMarkdownEditor.test.tsx` mounts the production editor with each body and checks that hydration emits no user change or save. Normalization must preserve Markdown semantics for supported cases.
- One mixed nested-list case currently normalizes with changed semantics. `RichEditorFeasibility.test.tsx` confirms the current shell falls back to Markdown source mode without writing. This is a known parity gap, not a passing rich-editor case; investigate before declaring the native rich-editor gate complete.
- The local machine has an Android SDK and `adb` executable. ADB requires an escalated shell here because the default sandbox blocks its listener and LAN access.
- Baseline local verification: `npm run check` passed on 2026-09-16 (lint, 54 unit-test files / 336 tests, TypeScript and production Vite build). This validates the web baseline only.
- Prototype pins Expo 57.0.23 / React Native 0.86.3 / React 19.2.3 / MDXEditor 4.2.3. Its native shell uses an Expo DOM component with a fake async event host and imports the shared fixture corpus. `npm run typecheck` passes. A production Android export succeeds with `EXPO_NO_BUNDLE_SPLITTING=1` and contains a 1.4 MB Hermes native bundle plus local 5.1 MB JavaScript, 46 KB CSS and HTML for the editor. Without that flag, Expo's DOM export fails to find a generated `__common` chunk; this needs re-testing on a newer compatible SDK.
- `./gradlew assembleRelease --no-daemon` completed successfully in the generated Android project. The ignored `app-release.apk` is 67 MB and archive inspection found `assets/index.android.bundle` plus local editor HTML, CSS and JavaScript under `assets/www.bundle/`. This is a **debug-signed release variant**, suitable for the feasibility gate but not for distribution.
- On 2026-09-16 the APK was installed over wireless ADB on a OnePlus 8T (KB2003), Android 14. `am start` accepted the launch and the app process remained running. The user subsequently inspected the DOM editor screen and reported the rendering results below. Offline launch, IME and accessibility have **not** yet been verified; touch dragging has had an initial successful manual check only.

### First on-device rendering report

The first APK used MDXEditor's built-in plugins rather than Web Notes' custom importers. On the OnePlus 8T, the tester reported: ordinary text and tables displayed; checkboxes were editable; wikilinks were plain text; a linked broken image and the following paragraph were absent; fenced code and the horizontal rule were absent; background colours were absent and source mode showed an `&#x20;` entity in place of the expected comment. The `:smile:` text in the first fixture was a misleading static sample—colon names are autocomplete input, not saved emoji markup.

The second prototype revision imports the actual website wikilink/image, background and calendar Markdown plugins, adds the production code-block companion plugin, and separates the colour/calendar fixtures. The image and calendar services remain intentionally fake. The updated release APK built and was installed on the same device on 2026-09-16. On retest, the user reported that the remaining visible issue was oversized emoji in headings and body text. The prototype lacked the website's `.twemoji` sizing rule; a third APK with that rule built successfully, but wireless ADB was offline and refused reconnection, so it has not yet been installed. A visual retest and source-mode snapshots are still needed before marking the earlier fidelity failures closed. In particular, missing text following an image is a content-fidelity gate failure, not merely a missing placeholder.

The subsequent APK includes that emoji rule and a handle-free, 450 ms long-press block-drag experiment. Its gesture unit tests cover scroll cancellation and paragraph movement, and the complete web check passes (55 test files, 340 tests). It was installed on the OnePlus 8T. The tester confirmed the emoji sizes look right, but the first long-press attempt selected text instead of dragging. A later build suppresses selection only during a pending drag gesture; the tester reports that drag and drop now looks good. Short taps, scrolling, text selection outside a drag, links, checkboxes and Markdown snapshots still need systematic device checks.

The tester also found that a short fenced code block occupied an unnecessarily tall editor. The prototype had a global `.cm-editor` minimum height intended for Markdown source mode, which also applied to MDXEditor's embedded code blocks. The rule is now scoped to the source editor and the corrected APK builds successfully; on-device confirmation is still needed that rich-text code blocks fit their content while Markdown source mode fills the panel.

## Acceptance checklist

| Gate | Evidence needed | Current result |
| --- | --- | --- |
| Editor bundles without Metro/internet | Install a release-like APK, launch in airplane mode, and verify CSS, code chunks, Twemoji and widget assets | Debug-signed release APK launched and screen inspected; native/DOM assets present in archive. No airplane-mode or complete custom-plugin asset result yet |
| Production Markdown fidelity | Run shared corpus in the Android DOM surface; compare semantically after mount/mode switch and byte-for-byte when no edit is made | First built-in-plugin APK failed several fixtures; production-plugin APK installed and awaits device retest. One nested-list source fallback remains |
| Hydration safety | Instrument host write calls; assert zero writes on mount, image resolution, calendar refresh, theme/rotation and mode switch | Web mount no-change tests started; native untested |
| Android IME and selection | Gboard and Samsung Keyboard: composition, autocorrect, selection, copy/paste, undo and long nested notes | Not started; physical devices required |
| Insets, scaling and scroll | Keyboard open/close, rotation, large text, long table and late image resolution keep caret visible | Not started |
| Cross-boundary actions | Suggestions, native sheets, image picker bookmark, calendar access, hardware shortcuts and TalkBack | Not started |
| Touch block moves | Handle-free long press: short tap, scroll cancellation, before/after/nest, auto-scroll, links/checkboxes and text-selection conflict; compare Markdown snapshots | Tester confirms dragging looks good after pending-selection suppression; detailed regression checks remain |
| Auth and private assets | Real test-vault Drive listing/upload, silent restoration, optional shared Calendar consent, private image rendering | Not started; test Google Cloud clients and device needed |
| Bridge durability/performance | Scope/revision validation, delayed acknowledgements, app kill/restart; measure 10 KB, 100 KB, 1 MB notes on named mid-range hardware | Not started |

## Next validation slice

1. Retest every corpus fixture on the production-plugin APK, especially text after the broken image, code/rule rendering and comment preservation. Compare a source-mode snapshot to the fixture, not only what appears visually.
2. Add a genuine host write-attempt counter and semantic-diff report to the fake host. Preserve the deliberate nested-list source fallback until its import behavior is fixed.
3. Exercise airplane-mode launch, Gboard/Samsung Keyboard, image delivery, the handle-free touch-drag fixture, accessibility and optional native Drive/Calendar grants on devices. In particular, check whether long press can start drag without Android's text-selection menu appearing, while normal scrolling still works. Record model/Android/keyboard versions and failures before choosing the production architecture.

Do not mark Phase 0 complete from jsdom tests or a debug Metro build: the main risks are Android WebView/IME behavior, release asset loading and durable host communication.
