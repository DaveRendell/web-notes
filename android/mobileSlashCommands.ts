import { BLOCK_BACKGROUNDS, type BlockBackground } from '../web/src/lib/blockBackground';
import { getSlashCommandSuggestions, type SlashCommandId } from '../web/src/lib/slashCommands';

export const MOBILE_SLASH_COMMAND_IDS: ReadonlySet<SlashCommandId> = new Set<SlashCommandId>([
  'paragraph', 'heading', 'heading2', 'heading3', 'quote',
  'todo', 'bullet', 'numbered', ...BLOCK_BACKGROUNDS, 'clearBackground',
  'image', 'calendar',
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

// These deliberately mirror the Web Notes dark-theme palette in styles.css.
export const MOBILE_BLOCK_BACKGROUND_DARK_COLORS: Record<BlockBackground, string> = {
  gray: '#35383b',
  brown: '#493a30',
  orange: '#523b28',
  yellow: '#4b4429',
  green: '#2c4436',
  blue: '#2b4054',
  purple: '#41344f',
  pink: '#4c3343',
  red: '#503331',
};

const backgroundColorCss = BLOCK_BACKGROUNDS
  .map((color) => `[data-block-background="${color}"] { --block-bg: ${MOBILE_BLOCK_BACKGROUND_COLORS[color]}; }`)
  .join('\n');

const darkBackgroundColorCss = BLOCK_BACKGROUNDS
  .map((color) => `.prototype-shell.dark-theme [data-block-background="${color}"] { --block-bg: ${MOBILE_BLOCK_BACKGROUND_DARK_COLORS[color]}; }`)
  .join('\n');

// Keep this layout in step with the web app's block-background rules. Shadows
// paint into the existing margins and marker gutter, so the treatment does not
// alter indentation, line wrapping, or the spacing between list-item text.
export const MOBILE_BLOCK_BACKGROUND_CSS = `${backgroundColorCss}
${darkBackgroundColorCss}
.rich-markdown-content [data-block-background] {
  border-radius: 4px;
  background-color: var(--block-bg);
}
.rich-markdown-content [data-block-background]:not(.rich-block-drop-nest) {
  box-shadow:
    inset 0 0 0 1px var(--block-bg),
    0 0 0 1px var(--block-bg),
    0 0 0 6px var(--block-bg);
}
.rich-markdown-content li {
  margin-top: 0.4375rem;
  margin-bottom: 0.4375rem;
}
.rich-markdown-content li[data-block-background]:not(.rich-block-drop-nest) {
  --block-marker-highlight-offset: 0px;
  box-shadow:
    inset 0 0 0 1px var(--block-bg),
    0 0 0 1px var(--block-bg),
    0 0 0 4px var(--block-bg),
    var(--block-marker-highlight-offset) 0 0 4px var(--block-bg);
}
.rich-markdown-content li[data-block-background-join-before] {
  border-start-start-radius: 0;
  border-start-end-radius: 0;
}
.rich-markdown-content li[data-block-background-join-after] {
  border-end-start-radius: 0;
  border-end-end-radius: 0;
}
.rich-markdown-content ul > li[data-block-background]:not([role="checkbox"]) {
  --block-marker-highlight-offset: -1.5rem;
}
.rich-markdown-content ol > li[data-block-background]:not([role="checkbox"]) {
  --block-marker-highlight-offset: -2rem;
}`;

export function getMobileSlashCommandSuggestions(query: string, recentIds?: SlashCommandId[]) {
  return getSlashCommandSuggestions(query, recentIds).filter(({ id }) => MOBILE_SLASH_COMMAND_IDS.has(id));
}
