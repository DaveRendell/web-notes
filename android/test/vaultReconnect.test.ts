import { describe, expect, it, vi } from 'vitest';
import { createVaultReconnectCoordinator } from '../vaultReconnect';

const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };

describe('vault reconnect triggers', () => {
  it('does not scan for the initial online notification or repeated capability updates', async () => {
    const reconnect = vi.fn().mockResolvedValue(undefined);
    const coordinator = createVaultReconnectCoordinator(reconnect, vi.fn(), 'active');
    for (let i = 0; i < 6; i++) {
      coordinator.networkChanged(true);
      await settle();
    }
    expect(reconnect).not.toHaveBeenCalled();
  });

  it('scans once on a genuine reconnection, not subsequent online notifications', async () => {
    const reconnect = vi.fn().mockResolvedValue(undefined);
    const coordinator = createVaultReconnectCoordinator(reconnect, vi.fn(), 'active');
    coordinator.networkChanged(false);
    coordinator.networkChanged(null);
    coordinator.networkChanged(true);
    await settle();
    coordinator.networkChanged(true);
    await settle();
    expect(reconnect).toHaveBeenCalledTimes(1);
    coordinator.networkChanged(false);
    coordinator.networkChanged(true);
    await settle();
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it('coalesces network and foreground events throughout the pending refresh', async () => {
    let release!: () => void;
    const reconnect = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const coordinator = createVaultReconnectCoordinator(reconnect, vi.fn(), 'background');
    coordinator.networkChanged(false);
    coordinator.networkChanged(true);
    coordinator.appStateChanged('active');
    await settle();
    coordinator.appStateChanged('background');
    coordinator.appStateChanged('active');
    expect(reconnect).toHaveBeenCalledTimes(1);
    release();
    await settle();
    coordinator.appStateChanged('active');
    await settle();
    expect(reconnect).toHaveBeenCalledTimes(1);
    coordinator.appStateChanged('background');
    coordinator.appStateChanged('active');
    await settle();
    expect(reconnect).toHaveBeenCalledTimes(2);
    release();
  });

  it('does not try to refresh on foregrounding while known to be offline', async () => {
    const reconnect = vi.fn().mockResolvedValue(undefined);
    const coordinator = createVaultReconnectCoordinator(reconnect, vi.fn(), 'background');
    coordinator.networkChanged(false);
    coordinator.appStateChanged('active');
    await settle();
    expect(reconnect).not.toHaveBeenCalled();
    coordinator.networkChanged(true);
    await settle();
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('reports failures and allows retry on the next real transition', async () => {
    const error = new Error('Drive unavailable');
    const reconnect = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const onError = vi.fn();
    const coordinator = createVaultReconnectCoordinator(reconnect, onError, 'active');
    coordinator.networkChanged(false);
    coordinator.networkChanged(true);
    await settle();
    expect(onError).toHaveBeenCalledWith(error);
    coordinator.networkChanged(false);
    coordinator.networkChanged(true);
    await settle();
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it('ignores notifications and queued work after disposal', async () => {
    const reconnect = vi.fn().mockResolvedValue(undefined);
    const coordinator = createVaultReconnectCoordinator(reconnect, vi.fn(), 'background');
    coordinator.appStateChanged('active');
    coordinator.dispose();
    coordinator.networkChanged(false);
    coordinator.networkChanged(true);
    await settle();
    expect(reconnect).not.toHaveBeenCalled();
  });
});
