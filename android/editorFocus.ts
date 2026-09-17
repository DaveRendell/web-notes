// Android may dismiss its IME while WebView leaves contenteditable focused.
// Clearing both focus and the DOM selection hides the caret and re-enables
// long-press block dragging without changing the editor's Markdown.
export function dismissEditorCaret(shell: HTMLElement) {
  const active = document.activeElement;
  if (active instanceof HTMLElement && shell.contains(active)) active.blur();
  const selection = window.getSelection();
  if (selection?.anchorNode && shell.contains(selection.anchorNode)) selection.removeAllRanges();
}
