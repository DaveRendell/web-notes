import { describe, expect, it } from 'vitest';
import { BLOCK_BACKGROUNDS } from '../../web/src/lib/blockBackground';
import { getMobileSlashCommandSuggestions, MOBILE_BLOCK_BACKGROUND_COLORS, MOBILE_BLOCK_BACKGROUND_CSS, MOBILE_BLOCK_BACKGROUND_DARK_COLORS, MOBILE_SLASH_COMMAND_IDS } from '../mobileSlashCommands';

describe('Android slash commands', () => {
  it('offers block, list, background, image, and calendar commands', () => {
    expect(getMobileSlashCommandSuggestions('').map(({ id }) => id)).toEqual(expect.arrayContaining([
      'paragraph', 'heading', 'quote', 'todo', 'bullet', 'numbered', 'green', 'gray',
    ]));
    expect(MOBILE_SLASH_COMMAND_IDS.has('image')).toBe(true);
    expect(MOBILE_SLASH_COMMAND_IDS.has('calendar')).toBe(true);
    expect(MOBILE_SLASH_COMMAND_IDS.has('clearBackground')).toBe(true);
    expect(getMobileSlashCommandSuggestions('image').map(({ id }) => id)).toContain('image');
    expect(getMobileSlashCommandSuggestions('calendar').map(({ id }) => id)).toContain('calendar');
    expect(getMobileSlashCommandSuggestions('agenda').map(({ id }) => id)).toEqual(['calendar']);
  });

  it('filters suggestions and puts recently used commands first', () => {
    expect(getMobileSlashCommandSuggestions('check').map(({ id }) => id)).toContain('todo');
    expect(getMobileSlashCommandSuggestions('grey').map(({ id }) => id)).toEqual(['gray']);
    expect(getMobileSlashCommandSuggestions('', ['green', 'todo']).slice(0, 2).map(({ id }) => id)).toEqual(['green', 'todo']);
  });

  it('defines a visible style for every background command', () => {
    expect(Object.keys(MOBILE_BLOCK_BACKGROUND_COLORS)).toEqual(BLOCK_BACKGROUNDS);
    expect(Object.keys(MOBILE_BLOCK_BACKGROUND_DARK_COLORS)).toEqual(BLOCK_BACKGROUNDS);
    for (const color of BLOCK_BACKGROUNDS) {
      expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain(`[data-block-background="${color}"]`);
      expect(MOBILE_BLOCK_BACKGROUND_COLORS[color]).toMatch(/^#[0-9a-f]{6}$/);
      expect(MOBILE_BLOCK_BACKGROUND_DARK_COLORS[color]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain('.prototype-shell.dark-theme [data-block-background="gray"] { --block-bg: #35383b; }');
    expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain('.prototype-shell.dark-theme [data-block-background="red"] { --block-bg: #503331; }');
    expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain('li[data-block-background-join-before]');
    expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain('li[data-block-background-join-after]');
    expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain('--block-marker-highlight-offset: -1.5rem');
    expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain('--block-marker-highlight-offset: -2rem');
    expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain('margin-top: 0.4375rem');
    expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain('0 0 0 4px var(--block-bg)');
  });
});
