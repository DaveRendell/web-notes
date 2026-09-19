import { describe, expect, it } from 'vitest';
import { BLOCK_BACKGROUNDS } from '../../web/src/lib/blockBackground';
import { getMobileSlashCommandSuggestions, MOBILE_BLOCK_BACKGROUND_COLORS, MOBILE_BLOCK_BACKGROUND_CSS, MOBILE_SLASH_COMMAND_IDS } from '../mobileSlashCommands';

describe('Android slash commands', () => {
  it('offers block, list, and background commands while hiding unsupported integrations', () => {
    expect(getMobileSlashCommandSuggestions('').map(({ id }) => id)).toEqual(expect.arrayContaining([
      'paragraph', 'heading', 'quote', 'todo', 'bullet', 'numbered', 'green', 'gray',
    ]));
    expect(MOBILE_SLASH_COMMAND_IDS.has('image')).toBe(false);
    expect(MOBILE_SLASH_COMMAND_IDS.has('calendar')).toBe(false);
    expect(getMobileSlashCommandSuggestions('image')).toEqual([]);
    expect(getMobileSlashCommandSuggestions('agenda')).toEqual([]);
  });

  it('filters suggestions and puts recently used commands first', () => {
    expect(getMobileSlashCommandSuggestions('check').map(({ id }) => id)).toContain('todo');
    expect(getMobileSlashCommandSuggestions('grey').map(({ id }) => id)).toEqual(['gray']);
    expect(getMobileSlashCommandSuggestions('', ['green', 'todo']).slice(0, 2).map(({ id }) => id)).toEqual(['green', 'todo']);
  });

  it('defines a visible style for every background command', () => {
    expect(Object.keys(MOBILE_BLOCK_BACKGROUND_COLORS)).toEqual(BLOCK_BACKGROUNDS);
    for (const color of BLOCK_BACKGROUNDS) {
      expect(MOBILE_BLOCK_BACKGROUND_CSS).toContain(`[data-block-background="${color}"]`);
      expect(MOBILE_BLOCK_BACKGROUND_COLORS[color]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
