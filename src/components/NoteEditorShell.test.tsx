import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./MarkdownEditor', () => ({
  MarkdownEditor: ({ initialCursorOffset, onChange, value }: {
    initialCursorOffset?: number | null;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label="Source editor"
      data-cursor={initialCursorOffset ?? ''}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  ),
}));

vi.mock('./RichMarkdownEditor', () => ({
  default: ({ markdown, onActiveChange, onActivity, onChange, onSave, spellCheck }: {
    markdown: string;
    onActiveChange: (active: boolean) => void;
    onActivity: () => void;
    onChange: (value: string) => void;
    onSave: () => void;
    spellCheck: boolean;
  }) => (
    <textarea
      aria-label="Rich editor"
      data-spellcheck={spellCheck}
      onBlur={() => onActiveChange(false)}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => {
        onActiveChange(true);
        onActivity();
      }}
      onKeyDown={(event) => {
        onActivity();
        if ((event.ctrlKey || event.metaKey) && event.key === 's') onSave();
      }}
      value={markdown}
    />
  ),
}));

import { NoteEditorShell } from './NoteEditorShell';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderEditor(value: string, onChange = vi.fn(), initialCursorOffset?: number | null, onSave = vi.fn()) {
  return {
    onChange,
    ...render(
      <NoteEditorShell
        initialCursorOffset={initialCursorOffset}
        notes={[]}
        onChange={onChange}
        onSave={onSave}
        recentNotes={[]}
        value={value}
      />,
    ),
  };
}

describe('NoteEditorShell', () => {
  it('starts in rich mode without rendering editor mode controls in the content area', async () => {
    renderEditor('Body');
    await screen.findByRole('textbox', { name: 'Rich editor' });
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull();
  });

  it('hides the rich toolbar state after ten seconds and resets the timer on activity', async () => {
    renderEditor('Body');
    const editor = await screen.findByRole('textbox', { name: 'Rich editor' });
    vi.useFakeTimers();
    fireEvent.focus(editor);
    const shell = editor.closest('.note-editor-shell')!;
    expect(shell.classList.contains('controls-visible')).toBe(true);
    expect(editor.getAttribute('data-spellcheck')).toBe('true');

    await act(() => vi.advanceTimersByTimeAsync(9_000));
    fireEvent.keyDown(editor, { key: 'a' });
    await act(() => vi.advanceTimersByTimeAsync(9_999));
    expect(shell.classList.contains('controls-visible')).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(shell.classList.contains('controls-visible')).toBe(false);
    expect(editor.getAttribute('data-spellcheck')).toBe('false');
  });

  it('saves and immediately hides rich controls and spellcheck on Ctrl+S', async () => {
    const onSave = vi.fn();
    renderEditor('Body', vi.fn(), undefined, onSave);
    const editor = await screen.findByRole('textbox', { name: 'Rich editor' });
    fireEvent.focus(editor);
    const shell = editor.closest('.note-editor-shell')!;

    expect(shell.classList.contains('controls-visible')).toBe(true);
    expect(editor.getAttribute('data-spellcheck')).toBe('true');

    fireEvent.keyDown(editor, { ctrlKey: true, key: 's' });

    expect(onSave).toHaveBeenCalledOnce();
    expect(shell.classList.contains('controls-visible')).toBe(false);
    expect(editor.getAttribute('data-spellcheck')).toBe('false');
  });

  it('passes only the body to rich mode and rejoins unchanged frontmatter and line endings', async () => {
    const onChange = vi.fn();
    renderEditor('---\r\ntitle: Note\r\n---\r\nOld\r\n', onChange);
    const editor = await screen.findByRole('textbox', { name: 'Rich editor' });

    expect((editor as HTMLTextAreaElement).value).toBe('Old\n');
    fireEvent.change(editor, { target: { value: 'New\ntext\n' } });
    expect(onChange).toHaveBeenCalledWith('---\r\ntitle: Note\r\n---\r\nNew\r\ntext\r\n');
  });

  it('falls back without modifying unsupported Markdown', () => {
    localStorage.setItem('web-notes:editor-mode', 'rich');
    const source = '<details>hidden</details>';
    const onChange = vi.fn();
    renderEditor(source, onChange);

    expect(screen.getByRole('textbox', { name: 'Source editor' })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('unsupported html');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('always uses exact source mode for click-derived cursor positions', async () => {
    localStorage.setItem('web-notes:editor-mode', 'rich');
    renderEditor('Body', vi.fn(), 3);

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Source editor' })).not.toBeNull());
    expect(screen.getByRole('textbox', { name: 'Source editor' }).getAttribute('data-cursor')).toBe('3');
  });
});
