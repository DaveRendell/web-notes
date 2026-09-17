import { afterEach, describe, expect, it } from 'vitest';
import { dismissEditorCaret } from '../../prototypes/android-editor/editorFocus';

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe('Android editor caret dismissal', () => {
  it('blurs an editor and removes its visible selection after the keyboard hides', () => {
    const shell = document.createElement('div');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.tabIndex = 0;
    editable.textContent = 'A note';
    shell.append(editable);
    document.body.append(shell);
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    window.getSelection()?.addRange(range);

    dismissEditorCaret(shell);

    expect(document.activeElement).toBe(document.body);
    expect(window.getSelection()?.rangeCount).toBe(0);
    expect(editable.textContent).toBe('A note');
  });

  it('does not disturb focus outside the editor', () => {
    const shell = document.createElement('div');
    const outside = document.createElement('button');
    document.body.append(shell, outside);
    outside.focus();

    dismissEditorCaret(shell);

    expect(document.activeElement).toBe(outside);
  });
});
