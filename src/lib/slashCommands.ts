import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { backgroundComment, BLOCK_BACKGROUNDS, type BlockBackground } from './blockBackground';
import { isProseCompletionContext } from './markdownCompletion';

export const OPEN_IMAGE_DIALOG_EVENT = 'web-notes:open-image-dialog';
const RECENT_COMMANDS_KEY = 'web-notes:recent-slash-commands';
const MAX_RECENT_COMMANDS = 8;

export type SlashCommandId =
  | 'paragraph' | 'heading' | 'heading2' | 'heading3' | 'quote'
  | 'todo' | 'bullet' | 'numbered' | 'image'
  | BlockBackground;

export type SlashCommand = {
  id: SlashCommandId;
  label: string;
  detail: string;
  keywords: string[];
  kind: 'block' | 'list' | 'background' | 'insert';
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'paragraph', label: 'Text', detail: 'Turn into plain text', keywords: ['paragraph', 'text'], kind: 'block' },
  { id: 'heading', label: 'Heading 1', detail: 'Turn into a large heading', keywords: ['heading', 'h1', 'title'], kind: 'block' },
  { id: 'heading2', label: 'Heading 2', detail: 'Turn into a medium heading', keywords: ['heading2', 'h2', 'subtitle'], kind: 'block' },
  { id: 'heading3', label: 'Heading 3', detail: 'Turn into a small heading', keywords: ['heading3', 'h3'], kind: 'block' },
  { id: 'quote', label: 'Quote', detail: 'Turn into a quote', keywords: ['quote', 'blockquote'], kind: 'block' },
  { id: 'todo', label: 'To-do list', detail: 'Turn into a checklist item', keywords: ['todo', 'checklist', 'task'], kind: 'list' },
  { id: 'bullet', label: 'Bulleted list', detail: 'Turn into a bullet item', keywords: ['bullet', 'bulleted', 'unordered', 'list'], kind: 'list' },
  { id: 'numbered', label: 'Numbered list', detail: 'Turn into a numbered item', keywords: ['numbered', 'ordered', 'number', 'list'], kind: 'list' },
  ...BLOCK_BACKGROUNDS.map((color): SlashCommand => ({
    id: color,
    label: `${color[0].toUpperCase()}${color.slice(1)} background`,
    detail: `Colour this block ${color}`,
    keywords: [color, ...(color === 'gray' ? ['grey'] : []), 'background', 'colour', 'color'],
    kind: 'background',
  })),
  { id: 'image', label: 'Image', detail: 'Upload or link an image', keywords: ['image', 'picture', 'photo', 'upload'], kind: 'insert' },
];

export function getSlashCommandSuggestions(query: string, recentIds = readRecentSlashCommands()) {
  const normalized = query.trim().toLowerCase();
  const recentRank = new Map(recentIds.map((id, index) => [id, index]));
  return SLASH_COMMANDS
    .filter((command) => !normalized || command.keywords.some((keyword) => keyword.includes(normalized)) || command.label.toLowerCase().includes(normalized))
    .sort((a, b) => {
      const aRecent = recentRank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRecent = recentRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (aRecent !== bRecent) return aRecent - bRecent;
      const aPrefix = a.keywords.some((keyword) => keyword.startsWith(normalized)) ? 0 : 1;
      const bPrefix = b.keywords.some((keyword) => keyword.startsWith(normalized)) ? 0 : 1;
      return aPrefix - bPrefix;
    });
}

export function readRecentSlashCommands(): SlashCommandId[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    const valid = new Set(SLASH_COMMANDS.map(({ id }) => id));
    return value.filter((id): id is SlashCommandId => typeof id === 'string' && valid.has(id as SlashCommandId)).slice(0, MAX_RECENT_COMMANDS);
  } catch {
    return [];
  }
}

export function rememberSlashCommand(id: SlashCommandId) {
  try {
    const next = [id, ...readRecentSlashCommands().filter((candidate) => candidate !== id)].slice(0, MAX_RECENT_COMMANDS);
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Could not remember the recent slash command.', error);
  }
}

export function requestImageDialog(element: HTMLElement | null) {
  element?.dispatchEvent(new CustomEvent(OPEN_IMAGE_DIALOG_EVENT, { bubbles: true }));
}

type SlashCompletion = Completion & { command: SlashCommand };

export function createSlashCommandCompletionSource(openImage: () => void) {
  return (context: CompletionContext): CompletionResult | null => {
    if (!isProseCompletionContext(context)) return null;
    const line = context.state.doc.lineAt(context.pos);
    const beforeCursor = context.state.sliceDoc(line.from, context.pos);
    const match = /(?:^|\s)\/([A-Za-z0-9]*)$/.exec(beforeCursor);
    if (!match) return null;
    const from = line.from + beforeCursor.lastIndexOf('/');
    const options: SlashCompletion[] = getSlashCommandSuggestions(match[1]).map((command) => ({
      label: command.label,
      detail: command.detail,
      type: command.kind,
      command,
      apply(view, _completion, completionFrom, to) {
        applyMarkdownSlashCommand(view, command, completionFrom, to, openImage);
      },
    }));
    return { from, options, validFor: /^\/[A-Za-z0-9]*$/ };
  };
}

export function applyMarkdownSlashCommand(view: EditorView, command: SlashCommand, from: number, to: number, openImage: () => void) {
  rememberSlashCommand(command.id);
  if (command.id === 'image') {
    view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } });
    openImage();
    return;
  }
  const prefixes: Partial<Record<SlashCommandId, string>> = {
    paragraph: '', heading: '# ', heading2: '## ', heading3: '### ', quote: '> ',
    todo: '- [ ] ', bullet: '- ', numbered: '1. ',
  };
  const prefix = prefixes[command.id];
  if (prefix !== undefined) {
    const line = view.state.doc.lineAt(from);
    const beforeCommand = view.state.sliceDoc(line.from, from);
    const existingMarker = /^(\s*)(?:(?:#{1,6}|>)\s+|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/.exec(beforeCommand);
    const markerTo = existingMarker ? line.from + existingMarker[0].length : line.from;
    const insertion = `${existingMarker?.[1] ?? ''}${prefix}`;
    const changes = [
      ...(markerTo > line.from || insertion ? [{ from: line.from, to: markerTo, insert: insertion }] : []),
      { from, to, insert: '' },
    ];
    const markerDelta = insertion.length - (markerTo - line.from);
    view.dispatch({ changes, selection: { anchor: from + markerDelta } });
    view.focus();
    return;
  }
  if (command.kind === 'background') {
    const insertion = `${backgroundComment(command.id as BlockBackground)}\n`;
    const lineFrom = view.state.doc.lineAt(from).from;
    view.dispatch({
      changes: [{ from, to, insert: '' }, { from: lineFrom, insert: insertion }],
      selection: { anchor: from + insertion.length },
    });
    view.focus();
  }
}
