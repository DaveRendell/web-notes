# Web Notes

A static React SPA for browsing and editing Markdown notes stored in Google Drive.

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
- A failed refresh leaves cached files and note content available read-only. The vault listing is retried when the browser comes back online.
- Successful Drive mutations update the tree and body cache immediately. A remote update discovered while editing never replaces the local draft; the editor warns before the next save overwrites Drive.
- **Sign out** retains cached data for the next session. **Disconnect Google Drive** removes all cached vaults and notes for that Drive account.

Cached Markdown is not encrypted by the app and relies on the security of the browser profile. Offline edits and queued writes are not supported.

## Checks

```sh
npm test
npm run lint
npm run build
```
