import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleTokenClient } from '../types/google';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

export function useGoogleAuth() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);

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
              setStatus('error');
              setError(response.error_description ?? response.error);
              return;
            }

            if (response.access_token) {
              setAccessToken(response.access_token);
              setStatus('authenticated');
              setError(null);
            }
          },
          error_callback: (authError) => {
            setStatus('error');
            setError(authError.message ?? authError.type ?? 'Google authentication failed.');
          },
        });
      })
      .catch((scriptError: unknown) => {
        if (!mounted) return;
        setStatus('error');
        setError(scriptError instanceof Error ? scriptError.message : 'Failed to load Google Identity Services.');
      });

    return () => {
      mounted = false;
    };
  }, []);

  const signIn = useCallback(() => {
    setStatus('loading');
    setError(null);
    tokenClientRef.current?.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  }, [accessToken]);

  const signOut = useCallback(() => {
    if (accessToken && window.google) {
      window.google.accounts.oauth2.revoke(accessToken, () => undefined);
    }

    setAccessToken(null);
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
