import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleTokenResponse } from '../types/google';
import { CALENDAR_SCOPES, DRIVE_SCOPE, useGoogleAuth } from './useGoogleAuth';

afterEach(() => {
  sessionStorage.clear();
  delete window.google;
});

describe('Google authentication scopes', () => {
  it('requests Calendar incrementally while retaining Drive access', async () => {
    sessionStorage.setItem('web-notes:google-access-token', JSON.stringify({
      accessToken: 'drive-token', accountId: 'account', expiresAt: Date.now() + 3_600_000, scopes: [DRIVE_SCOPE],
    }));
    let callback: ((response: GoogleTokenResponse) => void) | undefined;
    const requestAccessToken = vi.fn();
    window.google = { accounts: { oauth2: {
      hasGrantedAllScopes: vi.fn(() => true),
      initTokenClient: (config) => { callback = config.callback; return { requestAccessToken }; },
      revoke: vi.fn(),
    } } };

    const { result } = renderHook(() => useGoogleAuth());
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    let request!: Promise<string>;
    act(() => { request = result.current.requestCalendarAccess(); });
    expect(requestAccessToken).toHaveBeenCalledWith(expect.objectContaining({
      scope: [DRIVE_SCOPE, ...CALENDAR_SCOPES].join(' '),
    }));

    await act(async () => {
      callback?.({ access_token: 'combined-token', expires_in: 3600, scope: [DRIVE_SCOPE, ...CALENDAR_SCOPES].join(' ') });
      await request;
    });
    expect(result.current.hasCalendarAccess).toBe(true);
    await expect(result.current.ensureAccessToken()).resolves.toBe('combined-token');
  });
});
