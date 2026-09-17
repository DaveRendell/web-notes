import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleTokenClientConfig, GoogleTokenResponse } from '../types/google';
import { CALENDAR_SCOPES, DRIVE_SCOPE, useGoogleAuth } from './useGoogleAuth';

afterEach(() => {
  sessionStorage.clear();
  delete window.google;
  vi.unstubAllEnvs();
});

describe('Google authentication scopes', () => {
  it('requests Calendar incrementally while retaining Drive access', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    sessionStorage.setItem('web-notes:google-access-token', JSON.stringify({
      accessToken: 'drive-token', accountId: 'account', expiresAt: Date.now() + 3_600_000, scopes: [DRIVE_SCOPE],
    }));
    let callback: ((response: GoogleTokenResponse) => void) | undefined;
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn((config: GoogleTokenClientConfig) => {
      callback = config.callback;
      return { requestAccessToken };
    });
    window.google = { accounts: { oauth2: {
      hasGrantedAllScopes: vi.fn(() => true),
      initTokenClient,
      revoke: vi.fn(),
    } } };

    const { result } = renderHook(() => useGoogleAuth());
    // A restored token reports as authenticated before the effect that creates
    // Google's OAuth client has necessarily completed. Calendar authorization
    // must wait for that client rather than fail during this initialization gap.
    let request!: Promise<string>;
    act(() => { request = result.current.requestCalendarAccess(); });
    await waitFor(() => {
      expect(initTokenClient).toHaveBeenCalledOnce();
      expect(requestAccessToken).toHaveBeenCalledWith(expect.objectContaining({
        scope: [DRIVE_SCOPE, ...CALENDAR_SCOPES].join(' '),
      }));
    });

    await act(async () => {
      callback?.({ access_token: 'combined-token', expires_in: 3600, scope: [DRIVE_SCOPE, ...CALENDAR_SCOPES].join(' ') });
      await request;
    });
    expect(result.current.hasCalendarAccess).toBe(true);
    await expect(result.current.ensureAccessToken()).resolves.toBe('combined-token');
  });

  it('rejects authorization cleanly when the Google client ID is missing', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    window.google = { accounts: { oauth2: {
      hasGrantedAllScopes: vi.fn(() => false),
      initTokenClient: vi.fn(),
      revoke: vi.fn(),
    } } };

    const { result } = renderHook(() => useGoogleAuth());
    const request = result.current.requestCalendarAccess();

    await expect(request).rejects.toThrow('Missing VITE_GOOGLE_CLIENT_ID');
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
