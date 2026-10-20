/** Android emits capability updates even when connectivity has not changed. */
export function createVaultReconnectCoordinator(
  reconnect: () => Promise<void>,
  onError: (cause: unknown) => void,
  initialAppState: string | null,
) {
  let online: boolean | null = null;
  let appState = initialAppState;
  let pending = false;
  let disposed = false;

  const request = () => {
    if (disposed || pending || online === false) return;
    pending = true;
    void Promise.resolve().then(() => {
      if (!disposed) return reconnect();
    }).catch((cause: unknown) => {
      if (!disposed) onError(cause);
    }).finally(() => { pending = false; });
  };

  return {
    networkChanged(nextOnline: boolean | null) {
      if (nextOnline === null || disposed) return;
      const wasOffline = online === false;
      online = nextOnline;
      // The first notification establishes a baseline; activation already loads the vault.
      if (wasOffline && nextOnline) request();
    },
    appStateChanged(nextState: string) {
      const wasActive = appState === 'active';
      appState = nextState;
      if (!wasActive && nextState === 'active') request();
    },
    dispose() { disposed = true; },
  };
}
