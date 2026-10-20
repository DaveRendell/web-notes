import { GoogleSignin } from '@react-native-google-signin/google-signin';

// The native SDK keeps a single promise per operation. Never overlap native
// authorization calls, even when Drive and Calendar requests run in parallel.
let nativeOperation: Promise<unknown> = Promise.resolve();
export function runGoogleAuth<T>(operation: () => Promise<T>): Promise<T> {
  const next = nativeOperation.catch(() => {}).then(operation);
  nativeOperation = next;
  return next;
}

let tokenRequest: Promise<Awaited<ReturnType<typeof GoogleSignin.getTokens>>> | null = null;
export function getGoogleTokens() {
  if (tokenRequest) return tokenRequest;
  const task = runGoogleAuth(() => GoogleSignin.getTokens());
  const shared = task.finally(() => { if (tokenRequest === shared) tokenRequest = null; });
  tokenRequest = shared;
  return shared;
}

let restoreRequest: Promise<Awaited<ReturnType<typeof GoogleSignin.signInSilently>>> | null = null;
export function restoreGoogleSignIn() {
  if (restoreRequest) return restoreRequest;
  const task = runGoogleAuth(() => GoogleSignin.signInSilently());
  const shared = task.finally(() => { if (restoreRequest === shared) restoreRequest = null; });
  restoreRequest = shared;
  return shared;
}

const refreshRequests = new Map<string, ReturnType<typeof getGoogleTokens>>();
export function refreshGoogleTokens(expiredToken: string) {
  const pending = refreshRequests.get(expiredToken);
  if (pending) return pending;
  const task = runGoogleAuth(async () => {
    await GoogleSignin.clearCachedAccessToken(expiredToken);
    return GoogleSignin.getTokens();
  });
  const shared = task.finally(() => { if (refreshRequests.get(expiredToken) === shared) refreshRequests.delete(expiredToken); });
  refreshRequests.set(expiredToken, shared);
  return shared;
}
