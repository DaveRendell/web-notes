import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../contexts/ThemeContext';
import { richMarkdownCorpus } from '../test/richMarkdownCorpus';
import { NoteEditorShell } from './NoteEditorShell';

afterEach(cleanup);
beforeEach(() => localStorage.setItem('web-notes:theme', 'light'));

it('opens a checklist followed by ordinary bullets in rich mode without changing or saving the note', async () => {
  const onChange = vi.fn();
  const onSave = vi.fn();
  const { container } = render(<ThemeProvider><NoteEditorShell notes={[]} recentNotes={[]}
    onChange={onChange} onSave={onSave}
    value={'* [ ] test1\n* [ ] test2\n\n\n\n* test3\n* test4'} />
  </ThemeProvider>);
  await waitFor(() => expect(container.querySelectorAll('li')).toHaveLength(4), { timeout: 5_000 });
  expect(screen.queryByText(/Markdown mode is being used/)).toBeNull();
  expect(container.querySelector('.cm-content')).toBeNull();
  expect(container.querySelectorAll('li[role="checkbox"]')).toHaveLength(2);
  expect(onChange).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
});

it('retains a structurally incompatible list in Markdown mode without a hydration write', async () => {
  const source = richMarkdownCorpus.find((fixture) => 'requiresSourceFallback' in fixture)!.markdown;
  const onChange = vi.fn();
  const onSave = vi.fn();
  const { container } = render(
    <ThemeProvider>
      <NoteEditorShell
        notes={[]}
        onChange={onChange}
        onSave={onSave}
        recentNotes={[]}
        value={source}
      />
    </ThemeProvider>,
  );

  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Markdown mode is being used'), { timeout: 5_000 });
  expect(container.querySelector('.cm-content')).not.toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
});
