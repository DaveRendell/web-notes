type SelectionSnapshot = {
  ranges: Range[];
};

function captureSelection(editable: HTMLElement): SelectionSnapshot | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
    .filter((range) => editable.contains(range.commonAncestorContainer))
    .map((range) => range.cloneRange());

  return ranges.length > 0 ? { ranges } : null;
}

function restoreSelection(snapshot: SelectionSnapshot | null) {
  if (!snapshot) return;
  const selection = window.getSelection();
  if (!selection) return;

  const connectedRanges = snapshot.ranges.filter((range) => range.commonAncestorContainer.isConnected);
  if (connectedRanges.length === 0) return;

  selection.removeAllRanges();
  connectedRanges.forEach((range) => selection.addRange(range));
}

/**
 * Firefox can leave native spelling-error decorations painted after spellcheck
 * is disabled on a focused contenteditable. Focusing another contenteditable
 * for one frame forces that native layer to refresh.
 */
export function refreshContentEditableSpellcheck(
  editable: HTMLElement,
  onComplete: () => void,
  focusTarget: HTMLElement = editable,
): (() => void) | null {
  if (document.activeElement !== focusTarget) return null;

  const selection = captureSelection(editable);
  const refreshTarget = document.createElement('div');
  refreshTarget.setAttribute('contenteditable', 'true');
  refreshTarget.setAttribute('spellcheck', 'false');
  refreshTarget.setAttribute('aria-hidden', 'true');
  refreshTarget.tabIndex = -1;
  refreshTarget.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.append(refreshTarget);
  refreshTarget.focus({ preventScroll: true });

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (focusTarget.isConnected) {
      focusTarget.focus({ preventScroll: true });
      restoreSelection(selection);
    }
    refreshTarget.remove();
    onComplete();
  };

  const frame = window.requestAnimationFrame(finish);
  return () => {
    window.cancelAnimationFrame(frame);
    finish();
  };
}
