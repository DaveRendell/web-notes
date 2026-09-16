# Android editor feasibility prototype

This disposable Expo app tests the native/DOM editor boundary. It does not connect to Google, write notes or implement the production Android UI. It imports the same synthetic corpus as the web regression tests.

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

The artifact is `android/app/build/outputs/apk/release/app-release.apk`. The APK contains the native bundle and local DOM HTML, CSS and JavaScript. The long-press revision was installed and launched on a physical OnePlus 8T; the tester confirmed emoji sizing and basic dragging after a selection-suppression adjustment. Offline launch and detailed gesture regression checks remain untested. The generated `android/` tree and APK are ignored.

The native shell lets you step through fixtures and request a snapshot. The DOM surface uses MDXEditor 4.2.3 and CodeMirror, reports ready/normalization/user-change/error events through an async Expo native action, and deliberately has no save action. Frontmatter is excluded from the rich body. It imports the website's actual wikilink/emoji/image, background-colour and calendar Markdown plugins; vault images and calendar events use fake local services. It also has a provisional handle-free touch block drag adapter that invokes the website's Lexical move operation. It does **not** yet test authentication, private image delivery, the complete toolbar, accessible block action menu or durable drafts.

Colon emoji syntax such as `:smile:` is an *autocomplete trigger*, not a stored Markdown shortcode. To test it, place the cursor in text, type `:smi`, and check that the suggestion inserts a Unicode emoji. The corpus uses an actual emoji character for static rendering.

After installation, test airplane-mode launch, Gboard/Samsung IME, paste/selection, rotation, scaling, long-note scroll and the list fixture that currently falls back to Markdown on web. Record the device and keyboard versions in `docs/android-phase-0-validation.md` before treating results as gate evidence.

For the current rendering retest, check fixture 2's wikilinks, fixture 3's broken-image placeholder **and the following “After” paragraph**, fixture 5's fenced code/horizontal rule, fixture 6's coloured paragraph/task, and fixture 7's fake Calendar callout. Switching to Markdown should retain the background and Calendar comments rather than replacing them with an entity. No note in this prototype is saved to Drive.

For touch movement, open the **touch block movement** fixture. Press and hold a paragraph or list item's text for about half a second; it should dim and show a drag hint. Move vertically to get a blue before/after line, then release to move it. Drag right while over a list item to test nesting. A short tap should edit normally; moving immediately should scroll instead of dragging. Check that links and checkboxes still work, and compare the Markdown snapshot after each move. In particular, test whether Android's native long-press text-selection menu competes with activation; this is the main UX gate for the handle-free approach.

For the code-block sizing regression, open **table, quote, code, and rule**. The `const value = 1;` block should be only a few lines tall in Rich text mode. Switch to Markdown mode and confirm the source editor still fills the content panel.
