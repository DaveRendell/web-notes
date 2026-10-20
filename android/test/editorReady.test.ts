import { describe, expect, it, vi } from 'vitest';
import { afterEditorPaint } from '../editorReady';

function frames() {
  const callbacks: FrameRequestCallback[] = [];
  const request = vi.fn((callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length; });
  const cancel = vi.fn();
  const advance = () => { callbacks.shift()?.(0); };
  return { request, cancel, advance };
}

describe('editor session visibility handshake', () => {
  it('does not reveal the previous contents before the new session has painted', () => {
    const clock = frames();
    const ready = vi.fn();
    afterEditorPaint(ready, clock.request, clock.cancel);
    expect(ready).not.toHaveBeenCalled();
    clock.advance();
    expect(ready).not.toHaveBeenCalled();
    clock.advance();
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1])('cancels stale readiness when switching after %i frames', (frameCount) => {
    const clock = frames();
    const staleReady = vi.fn();
    const cancel = afterEditorPaint(staleReady, clock.request, clock.cancel);
    if (frameCount) clock.advance();
    cancel();
    clock.advance();
    clock.advance();
    expect(staleReady).not.toHaveBeenCalled();
    expect(clock.cancel).toHaveBeenCalledTimes(1);
    const nextReady = vi.fn();
    afterEditorPaint(nextReady, clock.request, clock.cancel);
    clock.advance();
    clock.advance();
    expect(nextReady).toHaveBeenCalledTimes(1);
  });
});
