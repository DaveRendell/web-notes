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

The app requests `https://www.googleapis.com/auth/drive.readonly` and keeps Drive access client-side using the signed-in user's OAuth token.
