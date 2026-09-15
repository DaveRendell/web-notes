import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleTokenClient } from '../types/google';
import { getDriveAccountId } from '../lib/googleDrive';
import { deleteAccountCache } from '../lib/vaultCache';
import { readMigratedStorage, removeMigratedStorage, safeLocalStorage as localStorage, safeSessionStorage as sessionStorage } from '../lib/browserStorage';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
export const CALENDAR_EVENT_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
export const CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const CALENDAR_SCOPES = [CALENDAR_EVENT_SCOPE, CALENDAR_LIST_SCOPE] as const;
const STORED_TOKEN_KEY = 'web-notes:google-access-token';
const LEGACY_STORED_TOKEN_KEY = 'vault-web-viewer:google-access-token';
const LEGACY_AUTO_RECONNECT_KEY = 'vault-web-viewer:auto-reconnect-google';
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const DEFAULT_TOKEN_LIFETIME_MS = 55 * 60 * 1000;

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';
type AuthRequestType = 'interactive' | 'refresh';

type PendingRefresh = {
  promise: Promise<string>;
  reject: (reason: Error) => void;
  scopes: string[];
  resolve: (accessToken: string) => void;
};

type PendingTokenClient = {
  promise: Promise<GoogleTokenClient>;
  reject: (reason: Error) => void;
  resolve: (client: GoogleTokenClient) => void;
};

type StoredToken = {
  accessToken: string;
  accountId?: string;
  expiresAt: number;
  scopes: string[];
};

export function useGoogleAuth() {
  const [token, setToken] = useState<StoredToken | null>(() => readStoredToken());
  const tokenRef = useRef(token);
  const [status, setStatus] = useState<AuthStatus>(token ? 'authenticated' : 'loading');
  const [isAccountResolved, setIsAccountResolved] = useState(Boolean(token?.accountId));
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const pendingTokenClientRef = useRef<PendingTokenClient | null>(null);
  if (!pendingTokenClientRef.current) pendingTokenClientRef.current = createPendingTokenClient();
  const pendingRequestRef = useRef<AuthRequestType>('interactive');
  const pendingRefreshRef = useRef<PendingRefresh | null>(null);
  const accessToken = token?.accessToken ?? null;
  const accountId = token?.accountId ?? null;
  const hasCalendarAccess = CALENDAR_SCOPES.every((scope) => token?.scopes.includes(scope));

  const setCurrentToken = useCallback((nextToken: StoredToken | null) => {
    tokenRef.current = nextToken;
    setToken(nextToken);
  }, []);

  useEffect(() => {
    let mounted = true;

    function resolveAccount(nextToken: StoredToken) {
      setIsAccountResolved(false);

      void getDriveAccountId(nextToken.accessToken)
        .then((resolvedAccountId) => {
          if (!mounted || tokenRef.current?.accessToken !== nextToken.accessToken) return;

          const identifiedToken = { ...nextToken, accountId: resolvedAccountId };
          setCurrentToken(identifiedToken);
          storeToken(identifiedToken);
          setIsAccountResolved(true);
        })
        .catch((accountError: unknown) => {
          if (!mounted) return;

          console.warn('[auth] Failed to identify the Google Drive account; cache disabled.', accountError);
          setIsAccountResolved(true);
        });
    }

    loadGoogleIdentityScript()
      .then(() => {
        if (!mounted) return;

        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
        if (!clientId) {
          setStatus('error');
          setError('Missing VITE_GOOGLE_CLIENT_ID. Add it to .env.local and restart the dev server.');
          return;
        }

        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          include_granted_scopes: true,
          callback: (response) => {
            if (response.error) {
              const message = response.error_description ?? response.error;

              if (pendingRequestRef.current === 'refresh') {
                pendingRefreshRef.current?.reject(new Error(message));
                pendingRefreshRef.current = null;
                setStatus(tokenRef.current ? 'authenticated' : 'idle');
                setError(null);
                return;
              }

              setStatus('error');
              setError(message);
              return;
            }

            if (response.access_token) {
              const nextToken = createStoredToken(
                response.access_token,
                response.expires_in,
                tokenRef.current?.accountId,
                parseGrantedScopes(response.scope, pendingRefreshRef.current?.scopes ?? [DRIVE_SCOPE]),
              );

              setCurrentToken(nextToken);
              storeToken(nextToken);
              setStatus('authenticated');
              setError(null);
              const pending = pendingRefreshRef.current;
              pendingRefreshRef.current = null;

              if (pending && pending.scopes.every((scope) => nextToken.scopes.includes(scope))) {
                pending.resolve(response.access_token);
              } else if (pending) {
                pending.reject(new Error('Google Calendar permission was not granted.'));
              }

              if (nextToken.accountId) {
                setIsAccountResolved(true);
              } else {
                resolveAccount(nextToken);
              }
            }
          },
          error_callback: (authError) => {
            const message = authError.message ?? authError.type ?? 'Google authentication failed.';

            if (pendingRequestRef.current === 'refresh') {
              pendingRefreshRef.current?.reject(new Error(message));
              pendingRefreshRef.current = null;
              setStatus(tokenRef.current ? 'authenticated' : 'idle');
              setError(null);
              return;
            }

            setStatus('error');
            setError(message);
          },
        });
        tokenClientRef.current = tokenClient;
        pendingTokenClientRef.current?.resolve(tokenClient);

        setStatus(tokenRef.current ? 'authenticated' : 'idle');

        if (tokenRef.current && !tokenRef.current.accountId) {
          resolveAccount(tokenRef.current);
        }
      })
      .catch((scriptError: unknown) => {
        if (!mounted) return;
        const resolvedError = scriptError instanceof Error
          ? scriptError
          : new Error('Failed to load Google Identity Services.');
        pendingTokenClientRef.current?.reject(resolvedError);
        setStatus('error');
        setError(resolvedError.message);
      });

    return () => {
      mounted = false;
    };
  }, [setCurrentToken]);

  const signIn = useCallback(() => {
    if (!tokenClientRef.current) {
      setStatus('error');
      setError('Google authentication is still loading. Try again in a moment.');
      return;
    }

    pendingRequestRef.current = 'interactive';
    setStatus('loading');
    setError(null);
    tokenClientRef.current.requestAccessToken({ prompt: '', scope: DRIVE_SCOPE });
  }, []);

  const signOut = useCallback(() => {
    pendingRefreshRef.current?.reject(new Error('Signed out while reconnecting to Google Drive.'));
    pendingRefreshRef.current = null;
    setCurrentToken(null);
    clearStoredToken();
    setIsAccountResolved(false);
    setStatus('idle');
    setError(null);
  }, [setCurrentToken]);

  const reconnect = useCallback(async (
    requiredScopes: readonly string[] = tokenRef.current?.scopes ?? [DRIVE_SCOPE],
  ) => {
    const tokenClient = tokenClientRef.current ?? await pendingTokenClientRef.current!.promise;

    if (pendingRefreshRef.current) {
      if (requiredScopes.every((scope) => pendingRefreshRef.current?.scopes.includes(scope))) {
        return pendingRefreshRef.current.promise;
      }
      return Promise.reject(new Error('Another Google authorization request is already in progress.'));
    }

    pendingRequestRef.current = 'refresh';
    setStatus('loading');
    setError(null);

    let rejectRefresh!: (reason: Error) => void;
    let resolveRefresh!: (accessToken: string) => void;
    const promise = new Promise<string>((resolve, reject) => {
      rejectRefresh = reject;
      resolveRefresh = resolve;
    });

    const scopes = uniqueScopes([DRIVE_SCOPE, ...(tokenRef.current?.scopes ?? []), ...requiredScopes]);
    pendingRefreshRef.current = { promise, reject: rejectRefresh, resolve: resolveRefresh, scopes };
    tokenClient.requestAccessToken({ prompt: '', scope: scopes.join(' ') });
    return promise;
  }, []);

  const ensureAccessToken = useCallback((requiredScopes: readonly string[] = [DRIVE_SCOPE]) => {
    if (token && token.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS
      && requiredScopes.every((scope) => token.scopes.includes(scope))) {
      return Promise.resolve(token.accessToken);
    }

    return reconnect(requiredScopes);
  }, [reconnect, token]);

  const requestCalendarAccess = useCallback(
    () => ensureAccessToken(CALENDAR_SCOPES),
    [ensureAccessToken],
  );

  const disconnect = useCallback(async () => {
    if (!window.google) {
      setStatus('error');
      setError('Google authentication is still loading. Try again in a moment.');
      return;
    }

    try {
      const tokenToRevoke = await ensureAccessToken();
      await new Promise<void>((resolve) => {
        window.google!.accounts.oauth2.revoke(tokenToRevoke, resolve);
      });
      if (accountId) {
        await deleteAccountCache(accountId);
      }
      signOut();
      localStorage.removeItem(LEGACY_AUTO_RECONNECT_KEY);
    } catch (disconnectError) {
      setStatus('authenticated');
      setError(disconnectError instanceof Error ? disconnectError.message : 'Failed to disconnect Google Drive.');
    }
  }, [accountId, ensureAccessToken, signOut]);

  const invalidateAccessToken = useCallback(() => {
    if (!tokenRef.current) return;

    setCurrentToken({ ...tokenRef.current, expiresAt: 0 });
    clearStoredToken();
  }, [setCurrentToken]);

  return {
    accessToken,
    accountId,
    disconnect,
    ensureAccessToken,
    error,
    hasCalendarAccess,
    invalidateAccessToken,
    isAccountResolved,
    isAuthenticated: Boolean(accessToken),
    requestCalendarAccess,
    signIn,
    signOut,
    status,
  };
}

function readStoredToken(): StoredToken | null {
  const storedValue = readMigratedStorage(sessionStorage, STORED_TOKEN_KEY, LEGACY_STORED_TOKEN_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    const storedToken = JSON.parse(storedValue) as StoredToken;

    const scopes = Array.isArray(storedToken.scopes)
      ? storedToken.scopes.filter((scope): scope is string => typeof scope === 'string')
      : typeof (storedToken as StoredToken & { scope?: unknown }).scope === 'string'
        ? [(storedToken as StoredToken & { scope: string }).scope]
        : [];

    if (!scopes.includes(DRIVE_SCOPE) || storedToken.expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
      removeMigratedStorage(sessionStorage, STORED_TOKEN_KEY, LEGACY_STORED_TOKEN_KEY);
      return null;
    }

    return { ...storedToken, scopes };
  } catch {
    removeMigratedStorage(sessionStorage, STORED_TOKEN_KEY, LEGACY_STORED_TOKEN_KEY);
    return null;
  }
}

function createStoredToken(accessToken: string, expiresInSeconds?: number, accountId?: string, scopes = [DRIVE_SCOPE]): StoredToken {
  const lifetimeMs = expiresInSeconds ? expiresInSeconds * 1000 : DEFAULT_TOKEN_LIFETIME_MS;

  return {
    accessToken,
    accountId,
    expiresAt: Date.now() + lifetimeMs,
    scopes: uniqueScopes(scopes),
  };
}

function parseGrantedScopes(scope: string | undefined, fallback: string[]) {
  return uniqueScopes(scope?.split(/\s+/).filter(Boolean) ?? fallback);
}

function uniqueScopes(scopes: readonly string[]) {
  return [...new Set(scopes)];
}

function storeToken(storedToken: StoredToken) {
  sessionStorage.setItem(STORED_TOKEN_KEY, JSON.stringify(storedToken));
}

function clearStoredToken() {
  removeMigratedStorage(sessionStorage, STORED_TOKEN_KEY, LEGACY_STORED_TOKEN_KEY);
}

function createPendingTokenClient(): PendingTokenClient {
  let reject!: (reason: Error) => void;
  let resolve!: (client: GoogleTokenClient) => void;
  const promise = new Promise<GoogleTokenClient>((promiseResolve, promiseReject) => {
    reject = promiseReject;
    resolve = promiseResolve;
  });
  // Initialization errors are also reflected in auth state. Attach a handler
  // now so browsers do not report an unhandled rejection if nobody requested
  // authorization while the Google script was loading.
  void promise.catch(() => undefined);
  return { promise, reject, resolve };
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts.oauth2) {
    return Promise.resolve();
  }

  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
  if (existingScript) {
    return new Promise<void>((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')), {
        once: true,
      });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.append(script);
  });
}
