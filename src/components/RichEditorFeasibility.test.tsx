import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../contexts/ThemeContext';
import { richMarkdownCorpus } from '../test/richMarkdownCorpus';
import { NoteEditorShell } from './NoteEditorShell';

afterEach(cleanup);
beforeEach(() => localStorage.setItem('web-notes:theme', 'light'));

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
