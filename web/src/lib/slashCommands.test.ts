import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMarkdownSlashCommand,
  createSlashCommandCompletionSource,
  getSlashCommandSuggestions,
  readRecentSlashCommands,
  rememberSlashCommand,
  SLASH_COMMANDS,
} from './slashCommands';

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

describe('slash commands', () => {
  it('offers all command groups and filters aliases', () => {
    expect(SLASH_COMMANDS.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'paragraph', 'heading', 'todo', 'bullet', 'numbered', 'gray', 'green', 'clearBackground', 'image', 'calendar',
    ]));
    expect(getSlashCommandSuggestions('check').map(({ id }) => id)).toContain('todo');
    expect(getSlashCommandSuggestions('pic').map(({ id }) => id)).toEqual(['image']);
    expect(getSlashCommandSuggestions('agenda').map(({ id }) => id)).toEqual(['calendar']);
  });

  it('puts recently used commands first and tolerates malformed storage', () => {
    rememberSlashCommand('green');
    rememberSlashCommand('todo');
    expect(readRecentSlashCommands()).toEqual(['todo', 'green']);
    expect(getSlashCommandSuggestions('').slice(0, 2).map(({ id }) => id)).toEqual(['todo', 'green']);
    localStorage.setItem('web-notes:recent-slash-commands', '{broken');
    expect(readRecentSlashCommands()).toEqual([]);
  });

  it('completes slash commands at a block start or after whitespace', async () => {
    const source = createSlashCommandCompletionSource(vi.fn());
    const validState = EditorState.create({ doc: '  /hea' });
    const result = await source(new CompletionContext(validState, validState.doc.length, true));
    expect(result?.from).toBe(2);
    expect(result?.options.map(({ label }) => label)).toContain('Heading 1');

    const proseState = EditorState.create({ doc: 'Some text /hea' });
    const proseResult = await source(new CompletionContext(proseState, proseState.doc.length, true));
    expect(proseResult?.options.map(({ label }) => label)).toContain('Heading 1');

    const pathState = EditorState.create({ doc: 'https://example.com' });
    expect(await source(new CompletionContext(pathState, pathState.doc.length, true))).toBeNull();

    const listState = EditorState.create({ doc: '- /todo' });
    const listResult = await source(new CompletionContext(listState, listState.doc.length, true));
    expect(listResult?.options.map(({ label }) => label)).toContain('To-do list');
  });

  it('can restrict completions for hosts without image or calendar integrations', async () => {
    const source = createSlashCommandCompletionSource(vi.fn(), vi.fn(), new Set(['heading', 'todo']));
    const state = EditorState.create({ doc: '/' });
    const result = await source(new CompletionContext(state, 1, true));
    expect(result?.options.map(({ label }) => label)).toEqual(['Heading 1', 'To-do list']);
  });

  it('applies block, background, and image commands in Markdown mode', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const image = vi.fn();
    const view = new EditorView({ parent, state: EditorState.create({ doc: '/heading' }) });
    applyMarkdownSlashCommand(view, SLASH_COMMANDS.find(({ id }) => id === 'heading')!, 0, 8, image);
    expect(view.state.doc.toString()).toBe('# ');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '- /todo' } });
    applyMarkdownSlashCommand(view, SLASH_COMMANDS.find(({ id }) => id === 'todo')!, 2, 7, image);
    expect(view.state.doc.toString()).toBe('- [ ] ');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Existing text /heading' } });
    applyMarkdownSlashCommand(view, SLASH_COMMANDS.find(({ id }) => id === 'heading')!, 14, 22, image);
    expect(view.state.doc.toString()).toBe('# Existing text ');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '- Existing /todo' } });
    applyMarkdownSlashCommand(view, SLASH_COMMANDS.find(({ id }) => id === 'todo')!, 11, 16, image);
    expect(view.state.doc.toString()).toBe('- [ ] Existing ');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '/green' } });
    applyMarkdownSlashCommand(view, SLASH_COMMANDS.find(({ id }) => id === 'green')!, 0, 6, image);
    expect(view.state.doc.toString()).toBe('<!-- web-notes:background=green -->\n');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '- Item <!-- web-notes:background=green --> /clear' } });
    const clearFrom = view.state.doc.toString().indexOf('/clear');
    applyMarkdownSlashCommand(view, SLASH_COMMANDS.find(({ id }) => id === 'clearBackground')!, clearFrom, clearFrom + '/clear'.length, image);
    expect(view.state.doc.toString()).toBe('- Item ');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '<!-- web-notes:background=blue -->\n\nText /remove' } });
    const removeFrom = view.state.doc.toString().indexOf('/remove');
    applyMarkdownSlashCommand(view, SLASH_COMMANDS.find(({ id }) => id === 'clearBackground')!, removeFrom, removeFrom + '/remove'.length, image);
    expect(view.state.doc.toString()).toBe('Text ');

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '/image' } });
    applyMarkdownSlashCommand(view, SLASH_COMMANDS.find(({ id }) => id === 'image')!, 0, 6, image);
    expect(view.state.doc.toString()).toBe('');
    expect(image).toHaveBeenCalledOnce();

    const calendar = vi.fn();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '/calendar' } });
    applyMarkdownSlashCommand(view, SLASH_COMMANDS.find(({ id }) => id === 'calendar')!, 0, 9, image, calendar);
    expect(view.state.doc.toString()).toBe('');
    expect(calendar).toHaveBeenCalledOnce();
    view.destroy();
  });
});
