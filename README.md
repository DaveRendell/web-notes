# Web Notes

A static React SPA for browsing and editing Markdown notes stored in Google Drive.

Notes open in an in-place rich-text surface. Its formatting toolbar stays out of the way until the note receives focus, and changes save to the local cache immediately before being pushed to Drive after one second of inactivity or when focus leaves the editor. Rich text supports common Markdown formatting, lists and checklists, links, wikilinks, tables, quotes, thematic breaks, and fenced code. Hover a block to reveal its grabber, then drag it to reorder or nest content; the same menu provides keyboard-accessible move, indent, outdent, and delete actions. Markdown remains the canonical stored format and an explicit source editor is available from the note menu; notes containing syntax that cannot be preserved safely automatically use source mode.

Type `/` at the start of a block to open slash commands for headings, plain text, quotes, lists, to-dos, block background colours, and images. Continue typing to filter the list; recently selected commands appear first the next time the empty `/` menu opens. Slash commands work in both rich-text and Markdown source modes.

Emoji are stored as standard Unicode in Markdown but displayed consistently using the Twemoji artwork in rich text and the surrounding interface. Twemoji graphics are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Setup

See [docs/google-drive-setup.md](docs/google-drive-setup.md) for the full Google Cloud and OAuth setup.

Copy `.env.example` to `.env.local` and set:

```txt
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

## Development

```sh
npm install
npm run dev
```

The app requests `https://www.googleapis.com/auth/drive` so it can read and edit Markdown files in the selected vault. Drive access stays client-side using Google's short-lived OAuth access tokens; the app has no client secret or backend token store.

Google normally asks for Drive consent only the first time access is granted. **Sign out** clears the local browser session without revoking that grant, making future sign-ins quicker. **Disconnect Google Drive** clears the session and revokes the grant, so Google will ask for consent again next time.

## Local cache

The app keeps an account-scoped cache in the browser's IndexedDB storage:

- A cached vault tree is shown immediately after sign-in while the latest file metadata is fetched from Drive.
- Note bodies are cached lazily when opened. Drive is only asked for the body again when its `modifiedTime` has changed or either timestamp is unavailable.
- Vault images are cached lazily in IndexedDB, isolated by account and vault and validated against Drive's `modifiedTime`. Matching cached images work offline, and concurrent requests share one download. The image cache is limited to 100 MB per browser, evicting the oldest downloads first. Cache failures are non-fatal; externally hosted images use normal browser caching. Disconnect also clears the account's cached images.
- A failed refresh leaves cached files and note content available read-only. The vault listing is retried when the browser comes back online.
- Successful Drive mutations update the tree and body cache immediately. A remote update discovered while editing never replaces the local draft; the editor warns before the next save overwrites Drive.
- **Sign out** retains cached data for the next session. **Disconnect Google Drive** removes all cached vaults and notes for that Drive account.

Cached Markdown is not encrypted by the app and relies on the security of the browser profile. Offline edits and queued writes are not supported.

## Favourites

Favourite note IDs and their order are stored in `.web-notes.json` at the root of the selected vault. This hidden settings file is created automatically and lets favourites follow the vault between browsers. It is not shown in the file picker. A small local copy keeps favourites visible while offline; changes made offline are synced when Drive becomes available again.

## Images

Both editor toolbars have an **Insert image** button. Use an HTTP/HTTPS image URL, choose an existing vault image, or upload an image (up to 20 MB) to the current note’s folder. Uploads with an existing filename get a numbered suffix. Inserted vault images use vault-root paths; existing note-relative Markdown image paths are also supported.

Pasting a clipboard image into either editor starts the same upload flow automatically, shows upload progress, and inserts the image once uploaded. Ordinary text paste is unchanged. The image viewer header displays the filename, image type, and file size.

Image action menus in the file picker and image viewer offer Rename and Delete. Renaming preserves the image extension; deletion requires confirmation. These actions update the cached file tree after Drive confirms success, but do not rewrite image references in notes.

Image files appear in the file picker and open in an image viewer. Private vault images are fetched using Drive authentication, never public sharing links. Missing or unsupported images display a placeholder without hiding the note. External images contact their host without sending a referrer. Image bytes are not stored in the offline IndexedDB cache; uploads require an internet connection. Moving or renaming an image does not rewrite existing Markdown references.

## Checks

```sh
npm test
npm run lint
npm run build
```

Run all three with `npm run check`. GitHub Actions runs these checks and the browser smoke suite on pull requests and pushes to `main`.

See [technical maintenance](docs/technical-maintenance.md) for reliability boundaries, dependency overrides, and remaining follow-ups.

### Browser checks

```sh
npx playwright install chromium
npm run test:browser
# Interactive runner for inspecting the site and stepping through tests:
npm run test:browser:ui
```

The Playwright suite starts its own Vite server on port 4173 and uses an isolated browser with a fake Drive session and intercepted Google requests. No real credentials, OAuth popup, or Drive writes are involved. Fixtures live in `e2e/vault.spec.ts`; extend them when adding browser regressions. The suite covers rich-text rendering, source-mode switching, search/navigation/history, autosaving, and cached rendering during a Drive outage. It is separate from Vitest so browser tests never accidentally run in jsdom. Worker counts are bounded (four for unit tests, two for browser tests) to avoid overloading local machines and CI.

Failures retain screenshots and traces in `test-results/`; inspect them with `npx playwright show-report` or `npx playwright show-trace <trace.zip>`. CI uploads failure reports for seven days. On Linux, browser installation may also require `npx playwright install --with-deps chromium`.

## Block background colours

Click a block's grabber and choose a **Background colour**, or **Default** to remove it. Colours use theme-aware shades and are saved with the note as hidden Markdown comments:

```markdown
<!-- web-notes:background=yellow -->
This paragraph is highlighted.

- A highlighted item <!-- web-notes:background=blue -->
```

Standalone annotations apply to the next block; inline list annotations apply to the list item. Other Markdown viewers normally hide these comments and show ordinary, uncoloured content. The raw Markdown editor keeps the annotations visible and editable.
