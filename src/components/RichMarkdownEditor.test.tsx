import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../contexts/ThemeContext';
import RichMarkdownEditor from './RichMarkdownEditor';

afterEach(cleanup);
beforeEach(() => localStorage.setItem('web-notes:theme', 'light'));

function renderEditor() {
  return render(
    <ThemeProvider>
      <RichMarkdownEditor
        markdown={'| Name | Value |\n| --- | --- |\n| Alpha | One |'}
        notes={[]}
        onActiveChange={vi.fn()}
        onActivity={vi.fn()}
        onChange={vi.fn()}
        onError={vi.fn()}
        onInitialNormalize={vi.fn()}
        onSave={vi.fn()}
        recentNotes={[]}
        spellCheck={false}
      />
    </ThemeProvider>,
  );
}

describe('rich Markdown table controls', () => {
  it('activates only the table containing the focused cell', async () => {
    const { container } = renderEditor();
    await waitFor(() => expect(container.querySelector('table [contenteditable="true"]')).not.toBeNull());

    const table = container.querySelector('table')!;
    expect(table.hasAttribute('data-web-notes-controls-active')).toBe(false);

    fireEvent.focus(container.querySelector('table [contenteditable="true"]')!);
    expect(table.getAttribute('data-web-notes-controls-active')).toBe('true');

    fireEvent.focus(container.querySelector('.mdxeditor-root-contenteditable')!);
    expect(table.hasAttribute('data-web-notes-controls-active')).toBe(false);
  });

  it('keeps controls active while a table popover is open', async () => {
    const { container } = renderEditor();
    await waitFor(() => expect(container.querySelector('table [contenteditable="true"]')).not.toBeNull());

    const table = container.querySelector('table')!;
    fireEvent.focus(container.querySelector('table [contenteditable="true"]')!);
    const menuTrigger = table.querySelector<HTMLElement>('[data-state]')!;
    menuTrigger.setAttribute('data-state', 'open');

    fireEvent.focus(container.querySelector('.rich-markdown-toolbar button')!);
    expect(table.getAttribute('data-web-notes-controls-active')).toBe('true');

    menuTrigger.setAttribute('data-state', 'closed');
    fireEvent.focus(container.querySelector('.rich-markdown-toolbar button')!);
    expect(table.hasAttribute('data-web-notes-controls-active')).toBe(false);
  });
});
