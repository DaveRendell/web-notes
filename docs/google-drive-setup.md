# Google Drive Setup

This app is a static browser app. It uses a Google OAuth client ID to ask the signed-in user for read-only access to their own Drive files.

The OAuth client ID is not a secret. It is expected to be present in the built JavaScript bundle. Do not add a Google client secret to this app.

## Required Environment Variable

Create a local env file:

```sh
cp .env.example .env.local
```

Set the OAuth client ID:

```txt
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

`VITE_GOOGLE_CLIENT_ID` comes from the OAuth client you create in Google Cloud. After you create the Web application client, Google shows a value named Client ID. It usually ends with `.apps.googleusercontent.com`. Copy that full Client ID into `.env.local`.

Restart the Vite dev server after changing `.env.local`.

## Google Cloud Setup

1. Open the Google Cloud Console.
2. Create or select a project for this app.
3. Enable the Google Drive API:
   - Go to APIs & Services.
   - Open Library.
   - Search for Google Drive API.
   - Enable it for the selected project.
4. Configure the OAuth consent screen:
   - Go to Google Auth platform.
   - Fill in the app name, support email, and developer contact email.
   - For local/private testing, add yourself as a test user if the app is in testing mode.
5. Add the Drive read-only scope if Google asks you to declare scopes:

```txt
https://www.googleapis.com/auth/drive.readonly
```

6. Create an OAuth client:
   - Go to Google Auth platform > Clients.
   - Click Create client.
   - Choose Web application.
   - Add the JavaScript origins listed below.
   - Create the client.
   - Copy the generated Client ID into `.env.local` as `VITE_GOOGLE_CLIENT_ID`.

## Authorized JavaScript Origins

For local development, add:

```txt
http://localhost:5173
```

For GitHub Pages, add your published site origin. Examples:

```txt
https://your-github-username.github.io
https://your-custom-domain.example
```

Use only the origin: scheme, hostname, and optional port. Do not include a path like `/vault_web_viewer`.

## Authorized Redirect URIs

This app uses the Google Identity Services token flow in the browser, so it does not currently require a server-side redirect URI.

If Google Cloud requires one for your chosen client configuration, use the exact app URL you serve from, for example:

```txt
http://localhost:5173
https://your-github-username.github.io
```

## API Keys

The current app does not require a Google API key. Drive requests are made with the user's OAuth access token.

If a future change introduces `VITE_GOOGLE_API_KEY`, treat it as public browser configuration and restrict it in Google Cloud:

1. Set Application restrictions to HTTP referrers.
2. Add only your local and production origins.
3. Set API restrictions to the specific Google APIs the app uses, such as Google Drive API.

## Security Notes

- Never commit `.env.local`.
- Never put a client secret in this SPA.
- Keep the OAuth scope read-only unless the app needs to write to Drive.
- Restrict OAuth origins to the domains where the app is actually hosted.
- Users can revoke the app's access from their Google Account permissions page.

## References

- Google Drive JavaScript quickstart: https://developers.google.com/drive/api/quickstart/js
- Google Identity Services client ID guide: https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
- Google Cloud API key restrictions: https://cloud.google.com/docs/authentication/api-keys
