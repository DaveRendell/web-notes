/** Wait for hydration commits and a browser paint before revealing a reused WebView. */
export function afterEditorPaint(
  ready: () => void,
  requestFrame: typeof requestAnimationFrame = requestAnimationFrame,
  cancelFrame: typeof cancelAnimationFrame = cancelAnimationFrame,
) {
  let cancelled = false;
  let frame = requestFrame(() => {
    if (cancelled) return;
    frame = requestFrame(() => { if (!cancelled) ready(); });
  });
  return () => { cancelled = true; cancelFrame(frame); };
}
