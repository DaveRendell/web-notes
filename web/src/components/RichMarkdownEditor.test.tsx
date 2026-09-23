import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../contexts/ThemeContext';
import { areMarkdownBodiesSemanticallyEquivalent, checkRichMarkdownCompatibility, splitMarkdownEnvelope } from '../lib/markdownEnvelope';
import { richMarkdownCorpus } from '../test/richMarkdownCorpus';
import RichMarkdownEditor from './RichMarkdownEditor';

vi.mock('./CalendarWidget', () => ({ CalendarWidget: () => <div data-testid="calendar-widget" /> }));

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

describe('rich Markdown checklists', () => {
  it('keeps text clicks in editing mode without making Space toggle the checkbox', async () => {
    const { container } = render(
      <ThemeProvider>
        <RichMarkdownEditor
          markdown="- [ ] Existing item"
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
    const item = await waitFor(() => {
      const candidate = container.querySelector<HTMLElement>('li[role="checkbox"]');
      expect(candidate).not.toBeNull();
      return candidate!;
    });
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 240, top: 0, bottom: 24, width: 240, height: 24, x: 0, y: 0, toJSON: () => ({}),
    });

    expect(item.getAttribute('tabindex')).toBe('-1');
    fireEvent.pointerDown(item, { clientX: 80 });
    expect(item.hasAttribute('tabindex')).toBe(false);
    await waitFor(() => expect(item.getAttribute('tabindex')).toBe('-1'));

    fireEvent.pointerDown(item, { clientX: 4 });
    expect(item.getAttribute('tabindex')).toBe('-1');
  });
});

describe('rich Markdown wikilinks', () => {
  it('opens ordinary clicks in the active tab and middle clicks in a new tab', async () => {
    const onOpenWikilink = vi.fn();
    const { container } = render(
      <ThemeProvider>
        <RichMarkdownEditor
          markdown="See [[Projects/Roadmap|the roadmap]]."
          notes={[]}
          onActiveChange={vi.fn()}
          onActivity={vi.fn()}
          onChange={vi.fn()}
          onError={vi.fn()}
          onInitialNormalize={vi.fn()}
          onOpenWikilink={onOpenWikilink}
          onSave={vi.fn()}
          recentNotes={[]}
          spellCheck={false}
        />
      </ThemeProvider>,
    );
    const shell = await waitFor(() => {
      const candidate = container.querySelector<HTMLElement>('.rich-markdown-editor-shell');
      expect(candidate).not.toBeNull();
      return candidate!;
    });
    const link = document.createElement('a');
    link.href = 'web-notes-wikilink:Projects%2FRoadmap?alias=the%20roadmap';
    link.textContent = 'the roadmap';
    shell.append(link);

    fireEvent.click(link);
    expect(onOpenWikilink).toHaveBeenCalledWith('Projects/Roadmap', false);
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(onOpenWikilink).toHaveBeenCalledWith('Projects/Roadmap', true);
  });
});

describe('portable rich Markdown corpus', () => {
  it.each(richMarkdownCorpus)('hydrates $name without treating initialization as an edit', async (fixture) => {
    const { markdown } = fixture;
    const { bodySource } = splitMarkdownEnvelope(markdown);
    expect(checkRichMarkdownCompatibility(markdown).compatible).toBe(true);
    const onChange = vi.fn();
    const onInitialNormalize = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <ThemeProvider>
        <RichMarkdownEditor
          markdown={bodySource}
          notes={[]}
          onActiveChange={vi.fn()}
          onActivity={vi.fn()}
          onChange={onChange}
          onError={vi.fn()}
          onInitialNormalize={onInitialNormalize}
          onSave={onSave}
          recentNotes={[]}
          spellCheck={false}
        />
      </ThemeProvider>,
    );

    await waitFor(() => expect(container.querySelector('.mdxeditor-root-contenteditable')).not.toBeNull());
    if ('requiresSourceFallback' in fixture && fixture.requiresSourceFallback) {
      await waitFor(() => expect(onInitialNormalize).toHaveBeenCalled());
    }
    for (const [normalized] of onInitialNormalize.mock.calls) {
      if ('requiresSourceFallback' in fixture && fixture.requiresSourceFallback) {
        expect(areMarkdownBodiesSemanticallyEquivalent(bodySource, normalized)).toBe(false);
      } else {
        expect(areMarkdownBodiesSemanticallyEquivalent(bodySource, normalized), normalized).toBe(true);
      }
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
