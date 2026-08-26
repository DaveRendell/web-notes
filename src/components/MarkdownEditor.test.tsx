import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from './MarkdownEditor';

afterEach(cleanup);

describe('MarkdownEditor formatting controls', () => {
  it('shows formatting buttons with their keyboard shortcuts', () => {
    renderEditor();

    expect(screen.getByRole('toolbar', { name: 'Text formatting' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-keyshortcuts')).toBe('Control+B Meta+B');
    expect(screen.getByRole('button', { name: 'Italic' }).getAttribute('aria-keyshortcuts')).toBe('Control+I Meta+I');
    expect(screen.getByRole('button', { name: 'Strikethrough' }).getAttribute('aria-keyshortcuts')).toBe(
      'Control+Shift+X Meta+Shift+X',
    );
    expect(screen.getByRole('button', { name: 'Checklist' }).getAttribute('aria-keyshortcuts')).toBe(
      'Control+L Meta+L',
    );
    expect(screen.getByRole('button', { name: 'Bulleted list' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Numbered list' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Link' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Underline' })).toBeNull();
  });

  it('applies formatting from a toolbar button', async () => {
    const onChange = vi.fn();
    renderEditor(onChange);

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0]).toBe('****body');
  });

  it('applies formatting with a platform-neutral keyboard shortcut', async () => {
    const onChange = vi.fn();
    const { container } = renderEditor(onChange);
    const editor = container.querySelector<HTMLElement>('.cm-content');

    fireEvent.keyDown(editor!, { code: 'KeyI', ctrlKey: true, key: 'i' });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0]).toBe('__body');
  });

  it('turns the current line into a checklist with Ctrl+L', async () => {
    const onChange = vi.fn();
    const { container } = renderEditor(onChange);
    const editor = container.querySelector<HTMLElement>('.cm-content');

    fireEvent.keyDown(editor!, { code: 'KeyL', ctrlKey: true, key: 'l' });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0]).toBe('- [ ] body');
  });

  it('intercepts Ctrl+S and invokes the save action', () => {
    const onSave = vi.fn();
    const { container } = renderEditor(vi.fn(), onSave);
    const editor = container.querySelector<HTMLElement>('.cm-content');

    const wasNotCancelled = fireEvent.keyDown(editor!, { code: 'KeyS', ctrlKey: true, key: 's' });

    expect(wasNotCancelled).toBe(false);
    expect(onSave).toHaveBeenCalledOnce();
  });
});

function renderEditor(onChange = vi.fn(), onSave = vi.fn()) {
  return render(
    <MarkdownEditor notes={[]} value="body" onChange={onChange} onSave={onSave} recentNotes={[]} />,
  );
}
