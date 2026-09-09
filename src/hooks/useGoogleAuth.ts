import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleTokenClient } from '../types/google';
import { getDriveAccountId } from '../lib/googleDrive';
import { deleteAccountCache } from '../lib/vaultCache';
import { readMigratedStorage, removeMigratedStorage, safeLocalStorage as localStorage, safeSessionStorage as sessionStorage } from '../lib/browserStorage';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
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
  resolve: (accessToken: string) => void;
};

type StoredToken = {
  accessToken: string;
  accountId?: string;
  expiresAt: number;
  scope: string;
};

export function useGoogleAuth() {
  const [token, setToken] = useState<StoredToken | null>(() => readStoredToken());
  const tokenRef = useRef(token);
  const [status, setStatus] = useState<AuthStatus>(token ? 'authenticated' : 'loading');
  const [isAccountResolved, setIsAccountResolved] = useState(Boolean(token?.accountId));
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const pendingRequestRef = useRef<AuthRequestType>('interactive');
  const pendingRefreshRef = useRef<PendingRefresh | null>(null);
  const accessToken = token?.accessToken ?? null;
  const accountId = token?.accountId ?? null;

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

        tokenClientRef.current = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
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
              );

              setCurrentToken(nextToken);
              storeToken(nextToken);
              setStatus('authenticated');
              setError(null);
              pendingRefreshRef.current?.resolve(response.access_token);
              pendingRefreshRef.current = null;

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

        setStatus(tokenRef.current ? 'authenticated' : 'idle');

        if (tokenRef.current && !tokenRef.current.accountId) {
          resolveAccount(tokenRef.current);
        }
      })
      .catch((scriptError: unknown) => {
        if (!mounted) return;
        setStatus('error');
        setError(scriptError instanceof Error ? scriptError.message : 'Failed to load Google Identity Services.');
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
    tokenClientRef.current.requestAccessToken({ prompt: '' });
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

  const reconnect = useCallback(() => {
    if (!tokenClientRef.current) {
      return Promise.reject(new Error('Google authentication is still loading. Try again in a moment.'));
    }

    if (pendingRefreshRef.current) {
      return pendingRefreshRef.current.promise;
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

    pendingRefreshRef.current = { promise, reject: rejectRefresh, resolve: resolveRefresh };
    tokenClientRef.current.requestAccessToken({ prompt: '' });
    return promise;
  }, []);

  const ensureAccessToken = useCallback(() => {
    if (token && token.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
      return Promise.resolve(token.accessToken);
    }

    return reconnect();
  }, [reconnect, token]);

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
    invalidateAccessToken,
    isAccountResolved,
    isAuthenticated: Boolean(accessToken),
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

    if (storedToken.scope !== DRIVE_SCOPE || storedToken.expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
      removeMigratedStorage(sessionStorage, STORED_TOKEN_KEY, LEGACY_STORED_TOKEN_KEY);
      return null;
    }

    return storedToken;
  } catch {
    removeMigratedStorage(sessionStorage, STORED_TOKEN_KEY, LEGACY_STORED_TOKEN_KEY);
    return null;
  }
}

function createStoredToken(accessToken: string, expiresInSeconds?: number, accountId?: string): StoredToken {
  const lifetimeMs = expiresInSeconds ? expiresInSeconds * 1000 : DEFAULT_TOKEN_LIFETIME_MS;

  return {
    accessToken,
    accountId,
    expiresAt: Date.now() + lifetimeMs,
    scope: DRIVE_SCOPE,
  };
}

function storeToken(storedToken: StoredToken) {
  sessionStorage.setItem(STORED_TOKEN_KEY, JSON.stringify(storedToken));
}

function clearStoredToken() {
  removeMigratedStorage(sessionStorage, STORED_TOKEN_KEY, LEGACY_STORED_TOKEN_KEY);
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
