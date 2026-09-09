# Technical maintenance

## Verification

- `npm run check`: lint, unit/component tests, TypeScript and production build.
- `npm run test:browser`: real Chromium smoke tests with a local Vite server,
  fake authentication and intercepted Drive requests. Install the browser first
  with `npx playwright install chromium`.
- `npm run test:browser:ui`: interactive browser test runner for debugging.
- `git diff --check`: whitespace errors.
- `npm audit`: check the current dependency lock against published advisories.

Browser tests exercise rendering, source mode, search/navigation, cached access
during a Drive outage and rich-text autosaving. Failure screenshots, HTML reports
and traces are generated locally and uploaded by the Checks workflow. They do
not verify real Google consent, permission policies or upload persistence; those
still need a deliberate manual check with a test vault. Never use personal Drive
tokens or note contents in fixtures or committed reports.

## Reliability boundaries

- Only complete, validated Drive listings may replace the tree and prune cache
  entries. Aborted, superseded or partially failed recursive listings do not.
- File visibility uses the shared node classifier, including supported images.
- Cache connections release on a cross-tab upgrade and reopen after unexpected
  termination. A newer incompatible schema remains a non-fatal cache failure.
- Browser preference/session persistence is best-effort. Restricted storage or
  quota errors do not crash the app; settings and authentication may need to be
  supplied again after a reload. Migration retains its old copy if writing fails.
- Failed images offer retry without reopening the note. Vault image downloads
  do not prompt for authentication while offline.

## Dependency maintenance

`js-yaml` is overridden to `4.3.2` because MDXEditor pins the vulnerable `4.3.1`.
This addresses GHSA-2883-xcg3-v3hh. Remove the override when upstream depends on
a patched version, and rerun both test suites when changing editor dependencies.
Keep Lexical packages aligned with the editor; do not apply forced major-version
audit upgrades without checking Markdown round trips and editor interactions.

## Remaining deliberate follow-ups

- The rich editor and initial application bundles still trigger Vite's large
  chunk warning. Profile actual loading before splitting dependencies: arbitrary
  chunks can introduce extra requests without reducing editor startup work.
- Extend the browser suite to Firefox, image clipboard/upload and drag-and-drop
  interactions. Unit tests cover parts of these, but browser-specific behavior
  deserves dedicated fixtures.
- Autosaving, authentication and vault mutations are substantial modules. Extract
  smaller controllers incrementally around tested boundaries rather than doing
  a large structural rewrite alongside behavior changes.
