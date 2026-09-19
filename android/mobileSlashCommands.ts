import { BLOCK_BACKGROUNDS, type BlockBackground } from '../web/src/lib/blockBackground';
import { getSlashCommandSuggestions, type SlashCommandId } from '../web/src/lib/slashCommands';

export const MOBILE_SLASH_COMMAND_IDS: ReadonlySet<SlashCommandId> = new Set<SlashCommandId>([
  'paragraph', 'heading', 'heading2', 'heading3', 'quote',
  'todo', 'bullet', 'numbered', ...BLOCK_BACKGROUNDS,
]);

export const MOBILE_BLOCK_BACKGROUND_COLORS: Record<BlockBackground, string> = {
  gray: '#e9e9e7',
  brown: '#eee0d5',
  orange: '#fae5cd',
  yellow: '#faf0c4',
  green: '#dfedde',
  blue: '#dcebf6',
  purple: '#ebe1f4',
  pink: '#f5e0ec',
  red: '#f7dfdc',
};

export const MOBILE_BLOCK_BACKGROUND_CSS = BLOCK_BACKGROUNDS
  .map((color) => `[data-block-background="${color}"] { --block-bg: ${MOBILE_BLOCK_BACKGROUND_COLORS[color]}; }`)
  .join('\n');

export function getMobileSlashCommandSuggestions(query: string, recentIds?: SlashCommandId[]) {
  return getSlashCommandSuggestions(query, recentIds).filter(({ id }) => MOBILE_SLASH_COMMAND_IDS.has(id));
}
