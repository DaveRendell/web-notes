# Vault Web Viewer

A static React SPA for browsing an Obsidian vault stored in Google Drive.

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
