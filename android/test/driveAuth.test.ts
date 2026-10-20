import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({
  configure: vi.fn(), getCurrentUser: vi.fn(), hasPreviousSignIn: vi.fn(),
  signInSilently: vi.fn(), signIn: vi.fn(), addScopes: vi.fn(),
  getTokens: vi.fn(), clearCachedAccessToken: vi.fn(), hasPlayServices: vi.fn(),
  network: vi.fn(), accountId: vi.fn(),
}));
vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: auth }));
vi.mock('expo-network', () => ({ getNetworkStateAsync: auth.network }));
vi.mock('../../web/src/lib/googleDrive', async (original) => ({ ...await original<typeof import('../../web/src/lib/googleDrive')>(), getDriveAccountId: auth.accountId }));
import { connectDrive, DRIVE_SCOPE, restoreDriveUser, withDriveToken } from '../driveAuth';
import { GoogleDriveError } from '../../web/src/lib/googleDrive';
import { getGoogleTokens, refreshGoogleTokens } from '../googleAuth';

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockReturnValue({ user: { id: 'google-user' }, scopes: [DRIVE_SCOPE] });
  auth.network.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  auth.getTokens.mockResolvedValue({ accessToken: 'token' });
  auth.accountId.mockResolvedValue('permission-id');
});
describe('native Drive authorization', () => {
  it('uses Drive permissionId rather than email to scope the cache', async () => {
    auth.signIn.mockResolvedValue({ type: 'success', data: { user: { id: 'google-user' }, scopes: [DRIVE_SCOPE] } });
    expect(await connectDrive()).toEqual({ accountId: 'permission-id', googleUserId: 'google-user' });
  });
  it('invalidates and refreshes an expired token exactly once', async () => {
    auth.getTokens.mockResolvedValueOnce({ accessToken: 'expired' }).mockResolvedValueOnce({ accessToken: 'fresh' });
    const operation = vi.fn().mockRejectedValueOnce(new GoogleDriveError('Expired', 401)).mockResolvedValueOnce('success');
    expect(await withDriveToken(operation)).toBe('success');
    expect(auth.clearCachedAccessToken).toHaveBeenCalledWith('expired');
    expect(operation.mock.calls).toEqual([['expired'], ['fresh']]);
  });
  it('shares one native token request across parallel folder and Calendar requests', async () => {
    let release!: (value: { accessToken: string }) => void;
    auth.getTokens.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const operation = vi.fn(async () => 'folder');
    const folders = Array.from({ length: 6 }, () => withDriveToken(operation));
    const calendarToken = getGoogleTokens();
    await vi.waitFor(() => expect(auth.getTokens).toHaveBeenCalledTimes(1));
    expect(operation).not.toHaveBeenCalled();
    release({ accessToken: 'shared-token' });
    expect(await Promise.all(folders)).toEqual(Array(6).fill('folder'));
    expect(await calendarToken).toEqual({ accessToken: 'shared-token' });
    expect(auth.getTokens).toHaveBeenCalledTimes(1);
  });
  it('coalesces simultaneous expired-token refreshes', async () => {
    let release!: (value: { accessToken: string }) => void;
    auth.getTokens.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const first = refreshGoogleTokens('expired');
    const second = refreshGoogleTokens('expired');
    await vi.waitFor(() => expect(auth.getTokens).toHaveBeenCalledTimes(1));
    release({ accessToken: 'fresh' });
    expect(await Promise.all([first, second])).toEqual([{ accessToken: 'fresh' }, { accessToken: 'fresh' }]);
    expect(auth.clearCachedAccessToken).toHaveBeenCalledTimes(1);
  });
  it('allows retrying token acquisition after a rejected shared request', async () => {
    auth.getTokens.mockRejectedValueOnce(new Error('Temporary failure'));
    await expect(getGoogleTokens()).rejects.toThrow('Temporary failure');
    await expect(getGoogleTokens()).resolves.toEqual({ accessToken: 'token' });
    expect(auth.getTokens).toHaveBeenCalledTimes(2);
  });
  it('does not replay a write on a 500 error', async () => {
    const operation = vi.fn().mockRejectedValue(new GoogleDriveError('Server error', 500));
    await expect(withDriveToken(operation)).rejects.toThrow('Server error');
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it('refuses to use a different account for a pending vault write', async () => {
    const operation = vi.fn();
    await expect(withDriveToken(operation, 'different-user')).rejects.toThrow('original Google Drive account');
    expect(operation).not.toHaveBeenCalled();
  });
  it('fails fast offline, allowing an immediate durable local save', async () => {
    auth.network.mockResolvedValue({ isConnected: false });
    const operation = vi.fn();
    await expect(withDriveToken(operation)).rejects.toThrow('Network unavailable');
    expect(auth.getTokens).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });
  it('does not show an authorization popup on background restoration', async () => {
    auth.getCurrentUser.mockReturnValue(null);
    auth.hasPreviousSignIn.mockReturnValue(true);
    auth.signInSilently.mockRejectedValue(new Error('Needs consent'));
    expect(await restoreDriveUser()).toBeNull();
    expect(auth.signIn).not.toHaveBeenCalled();
  });
  it('does not accept cancelled scope consent', async () => {
    auth.signIn.mockResolvedValue({ type: 'success', data: { user: { id: 'google-user' }, scopes: [] } });
    auth.addScopes.mockResolvedValue({ type: 'cancelled' });
    await expect(connectDrive()).rejects.toThrow('permission was not granted');
  });
});
