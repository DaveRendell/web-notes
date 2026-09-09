import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshContentEditableSpellcheck } from './contentEditableSpellcheck';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('refreshContentEditableSpellcheck', () => {
  it('cycles focus through a second contenteditable and restores the caret', () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.tabIndex = 0;
    const text = document.createTextNode('misspeled text');
    editable.append(text);
    document.body.append(editable);
    editable.focus();

    const range = document.createRange();
    range.setStart(text, 4);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const onComplete = vi.fn();
    const cancel = refreshContentEditableSpellcheck(editable, onComplete);

    expect(cancel).not.toBeNull();
    expect(document.activeElement).not.toBe(editable);
    expect(document.activeElement?.getAttribute('contenteditable')).toBe('true');

    scheduledFrame!(0);

    expect(document.activeElement).toBe(editable);
    expect(selection.anchorNode).toBe(text);
    expect(selection.anchorOffset).toBe(4);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(document.querySelector('[aria-hidden="true"][contenteditable="true"]')).toBeNull();
  });

  it('does nothing when the editable is not focused', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.append(editable);

    expect(refreshContentEditableSpellcheck(editable, vi.fn())).toBeNull();
  });

  it('can restore focus to an editor toolbar control', () => {
    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const toolbarButton = document.createElement('button');
    document.body.append(editable, toolbarButton);
    toolbarButton.focus();

    const onComplete = vi.fn();
    refreshContentEditableSpellcheck(editable, onComplete, toolbarButton);
    scheduledFrame!(0);

    expect(document.activeElement).toBe(toolbarButton);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
