import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleTokenClient } from '../types/google';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const STORED_TOKEN_KEY = 'vault-web-viewer:google-access-token';
const AUTO_RECONNECT_KEY = 'vault-web-viewer:auto-reconnect-google';
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const DEFAULT_TOKEN_LIFETIME_MS = 55 * 60 * 1000;

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';
type AuthRequestType = 'interactive' | 'silent';

type StoredToken = {
  accessToken: string;
  expiresAt: number;
};

export function useGoogleAuth() {
  const initialToken = readStoredToken();
  const [accessToken, setAccessToken] = useState<string | null>(initialToken);
  const [status, setStatus] = useState<AuthStatus>(initialToken ? 'authenticated' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const pendingRequestRef = useRef<AuthRequestType>('interactive');

  useEffect(() => {
    let mounted = true;

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
          scope: DRIVE_READONLY_SCOPE,
          callback: (response) => {
            if (response.error) {
              if (pendingRequestRef.current === 'silent') {
                setStatus('idle');
                setError(null);
              } else {
                setStatus('error');
                setError(response.error_description ?? response.error);
              }
              return;
            }

            if (response.access_token) {
              setAccessToken(response.access_token);
              storeToken(response.access_token, response.expires_in);
              localStorage.setItem(AUTO_RECONNECT_KEY, 'true');
              setStatus('authenticated');
              setError(null);
            }
          },
          error_callback: (authError) => {
            if (pendingRequestRef.current === 'silent') {
              setStatus('idle');
              setError(null);
            } else {
              setStatus('error');
              setError(authError.message ?? authError.type ?? 'Google authentication failed.');
            }
          },
        });

        if (!accessToken && shouldAutoReconnect()) {
          pendingRequestRef.current = 'silent';
          setStatus('loading');
          tokenClientRef.current.requestAccessToken({ prompt: '' });
        } else if (!accessToken) {
          setStatus('idle');
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
  }, [accessToken]);

  const signIn = useCallback(() => {
    if (!tokenClientRef.current) {
      setStatus('error');
      setError('Google authentication is still loading. Try again in a moment.');
      return;
    }

    pendingRequestRef.current = 'interactive';
    setStatus('loading');
    setError(null);
    tokenClientRef.current?.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  }, [accessToken]);

  const signOut = useCallback(() => {
    if (accessToken && window.google) {
      window.google.accounts.oauth2.revoke(accessToken, () => undefined);
    }

    setAccessToken(null);
    clearStoredAuth();
    setStatus('idle');
    setError(null);
  }, [accessToken]);

  return {
    accessToken,
    error,
    isAuthenticated: Boolean(accessToken),
    signIn,
    signOut,
    status,
  };
}

function readStoredToken() {
  const storedValue = sessionStorage.getItem(STORED_TOKEN_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    const storedToken = JSON.parse(storedValue) as StoredToken;

    if (storedToken.expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
      sessionStorage.removeItem(STORED_TOKEN_KEY);
      return null;
    }

    return storedToken.accessToken;
  } catch {
    sessionStorage.removeItem(STORED_TOKEN_KEY);
    return null;
  }
}

function storeToken(accessToken: string, expiresInSeconds?: number) {
  const lifetimeMs = expiresInSeconds ? expiresInSeconds * 1000 : DEFAULT_TOKEN_LIFETIME_MS;
  const storedToken: StoredToken = {
    accessToken,
    expiresAt: Date.now() + lifetimeMs - TOKEN_EXPIRY_BUFFER_MS,
  };

  sessionStorage.setItem(STORED_TOKEN_KEY, JSON.stringify(storedToken));
}

function clearStoredAuth() {
  sessionStorage.removeItem(STORED_TOKEN_KEY);
  localStorage.removeItem(AUTO_RECONNECT_KEY);
}

function shouldAutoReconnect() {
  return localStorage.getItem(AUTO_RECONNECT_KEY) === 'true';
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
