import type { EditorView } from '@codemirror/view';

export type MarkdownFormat = 'bold' | 'italic' | 'strikethrough';
export type MarkdownListType = 'ordered' | 'unordered';

type MarkdownFormatSpec = {
  close: string;
  open: string;
};

const FORMAT_SPECS: Record<MarkdownFormat, MarkdownFormatSpec> = {
  bold: { close: '**', open: '**' },
  italic: { close: '_', open: '_' },
  strikethrough: { close: '~~', open: '~~' },
};

export function toggleMarkdownFormat(view: EditorView, format: MarkdownFormat) {
  const { close, open } = FORMAT_SPECS[format];
  const selection = view.state.selection.main;
  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  const beforeSelection = view.state.sliceDoc(Math.max(0, selection.from - open.length), selection.from);
  const afterSelection = view.state.sliceDoc(selection.to, selection.to + close.length);

  if (beforeSelection === open && afterSelection === close) {
    const changeFrom = selection.from - open.length;
    view.dispatch({
      changes: { from: changeFrom, insert: selectedText, to: selection.to + close.length },
      selection: selectedText
        ? { anchor: changeFrom, head: changeFrom + selectedText.length }
        : { anchor: changeFrom },
      userEvent: 'input.format',
    });
    view.focus();
    return true;
  }

  const insert = `${open}${selectedText}${close}`;
  view.dispatch({
    changes: { from: selection.from, insert, to: selection.to },
    selection: selectedText
      ? { anchor: selection.from + open.length, head: selection.to + open.length }
      : { anchor: selection.from + open.length },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

export function toggleChecklist(view: EditorView) {
  return transformSelectedLines(view, (line) => {
    const prefix = parseLinePrefix(line.text);
    const marker = prefix.type === 'checklist' && !prefix.checked ? '- [x] ' : '- [ ] ';
    return { prefix, replacement: `${prefix.indent}${marker}` };
  });
}

export function toggleMarkdownList(view: EditorView, type: MarkdownListType) {
  const lines = getSelectedLines(view);
  const parsedLines = lines.map((line) => ({ line, prefix: parseLinePrefix(line.text) }));
  const shouldRemove = parsedLines.every(({ prefix }) => prefix.type === type);

  return applyLineChanges(
    view,
    parsedLines.map(({ line, prefix }, index) => ({
      from: line.from,
      insert: shouldRemove
        ? prefix.indent
        : `${prefix.indent}${type === 'ordered' ? `${index + 1}. ` : '- '}`,
      to: line.from + prefix.length,
    })),
  );
}

export function insertMarkdownLink(view: EditorView) {
  const selection = view.state.selection.main;
  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  const label = selectedText || 'text';
  const insert = `[${label}](url)`;
  const placeholderFrom = selectedText ? selection.from + label.length + 3 : selection.from + 1;
  const placeholderLength = selectedText ? 3 : label.length;

  view.dispatch({
    changes: { from: selection.from, insert, to: selection.to },
    selection: { anchor: placeholderFrom, head: placeholderFrom + placeholderLength },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

type ParsedLinePrefix = {
  checked?: boolean;
  indent: string;
  length: number;
  type: MarkdownListType | 'checklist' | null;
};

function parseLinePrefix(text: string): ParsedLinePrefix {
  const checklist = text.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+/);
  if (checklist) {
    return {
      checked: checklist[2].toLowerCase() === 'x',
      indent: checklist[1],
      length: checklist[0].length,
      type: 'checklist',
    };
  }

  const unordered = text.match(/^(\s*)[-*+]\s+/);
  if (unordered) {
    return { indent: unordered[1], length: unordered[0].length, type: 'unordered' };
  }

  const ordered = text.match(/^(\s*)\d+[.)]\s+/);
  if (ordered) {
    return { indent: ordered[1], length: ordered[0].length, type: 'ordered' };
  }

  const indent = text.match(/^\s*/)?.[0] ?? '';
  return { indent, length: indent.length, type: null };
}

function transformSelectedLines(
  view: EditorView,
  transform: (line: { from: number; text: string }) => { prefix: ParsedLinePrefix; replacement: string },
) {
  const changes = getSelectedLines(view).map((line) => {
    const { prefix, replacement } = transform(line);
    return { from: line.from, insert: replacement, to: line.from + prefix.length };
  });
  return applyLineChanges(view, changes);
}

function getSelectedLines(view: EditorView) {
  const selection = view.state.selection.main;
  const endPosition = selection.to > selection.from && view.state.doc.lineAt(selection.to).from === selection.to
    ? selection.to - 1
    : selection.to;
  const firstLine = view.state.doc.lineAt(selection.from).number;
  const lastLine = view.state.doc.lineAt(Math.max(selection.from, endPosition)).number;
  return Array.from({ length: lastLine - firstLine + 1 }, (_, index) => {
    const line = view.state.doc.line(firstLine + index);
    return { from: line.from, text: line.text };
  });
}

function applyLineChanges(
  view: EditorView,
  changes: Array<{ from: number; insert: string; to: number }>,
) {
  const changeSet = view.state.changes(changes);
  const selection = view.state.selection.main;
  view.dispatch({
    changes: changeSet,
    selection: {
      anchor: changeSet.mapPos(selection.anchor, 1),
      head: changeSet.mapPos(selection.head, 1),
    },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}
