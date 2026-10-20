import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getNetworkStateAsync } from 'expo-network';
import { getDriveAccountId, isGoogleDriveAuthError } from '../web/src/lib/googleDrive';
import { getGoogleTokens, refreshGoogleTokens, restoreGoogleSignIn, runGoogleAuth } from './googleAuth';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
// Configure once for both integrations. Calendar consent is requested separately.
GoogleSignin.configure({ scopes: [DRIVE_SCOPE], offlineAccess: false });

export async function connectDrive(): Promise<{ accountId: string; googleUserId: string }> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await runGoogleAuth(() => GoogleSignin.signIn());
  if (result.type !== 'success') throw new Error('Google Drive connection was cancelled.');
  if (!result.data.scopes.includes(DRIVE_SCOPE)) {
    const consent = await runGoogleAuth(() => GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] }));
    if (consent?.type !== 'success') throw new Error('Google Drive permission was not granted.');
  }
  return { accountId: await withDriveToken(getDriveAccountId, result.data.user.id), googleUserId: result.data.user.id };
}

export async function restoreDriveUser(): Promise<string | null> {
  let user = GoogleSignin.getCurrentUser();
  if (!user && GoogleSignin.hasPreviousSignIn()) {
    try {
      const restored = await restoreGoogleSignIn();
      if (restored.type === 'success') user = restored.data;
    } catch { return null; }
  }
  return user?.scopes.includes(DRIVE_SCOPE) ? user.user.id : null;
}

/** One silent token refresh on 401; never replay writes for other failures. */
export async function withDriveToken<T>(operation: (token: string) => Promise<T>, expectedUserId?: string): Promise<T> {
  const network = await getNetworkStateAsync();
  if (network.isConnected === false || network.isInternetReachable === false) throw new TypeError('Network unavailable; reconnect to sync your local changes.');
  const userId = await restoreDriveUser();
  if (!userId || expectedUserId && userId !== expectedUserId) throw new Error('Reconnect the original Google Drive account. Your draft has been preserved.');
  const token = (await getGoogleTokens()).accessToken;
  if (await restoreDriveUser() !== userId) throw new Error('The Google account changed while syncing. Your local version is preserved.');
  try { return await operation(token); }
  catch (cause) {
    if (!isGoogleDriveAuthError(cause)) throw cause;
    if (await restoreDriveUser() !== userId) throw new Error('The Google account changed while syncing. Your local version is preserved.');
    const freshToken = (await refreshGoogleTokens(token)).accessToken;
    if (await restoreDriveUser() !== userId) throw new Error('The Google account changed while syncing. Your local version is preserved.');
    return operation(freshToken);
  }
}
