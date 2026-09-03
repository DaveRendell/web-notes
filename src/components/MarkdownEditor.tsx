import { autocompletion } from '@codemirror/autocomplete';
import CodeMirror, { Prec } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';
import { Bold, Italic, Link, List, ListOrdered, ListTodo, Strikethrough } from 'lucide-react';
import { type MouseEvent, useMemo, useRef } from 'react';
import { createEmojiCompletionSource } from '../lib/emojiCompletion';
import {
  insertMarkdownLink,
  type MarkdownFormat,
  toggleChecklist,
  toggleMarkdownFormat,
  toggleMarkdownList,
} from '../lib/markdownFormatting';
import { createWikilinkCompletionSource } from '../lib/wikilinkCompletion';
import type { VaultNode } from '../types/vault';

type MarkdownEditorProps = {
  initialCursorOffset?: number | null;
  notes: VaultNode[];
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  recentNotes: VaultNode[];
};

export function MarkdownEditor({ initialCursorOffset, notes, value, onChange, onSave, recentNotes }: MarkdownEditorProps) {
  const editorViewRef = useRef<EditorView | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const editorCompletions = useMemo(
    () => autocompletion({
      override: [createWikilinkCompletionSource(notes, recentNotes), createEmojiCompletionSource()],
    }),
    [notes, recentNotes],
  );
  const formattingKeymap = useMemo(
    () => Prec.highest(keymap.of([
      { key: 'Mod-b', run: (view) => toggleMarkdownFormat(view, 'bold') },
      { key: 'Mod-i', run: (view) => toggleMarkdownFormat(view, 'italic') },
      { key: 'Mod-l', run: toggleChecklist },
      { key: 'Mod-s', run: () => {
        onSaveRef.current();
        return true;
      } },
      { key: 'Mod-Shift-x', run: (view) => toggleMarkdownFormat(view, 'strikethrough') },
    ])),
    [],
  );

  function applyFormat(format: MarkdownFormat) {
    const editorView = editorViewRef.current;
    if (editorView) toggleMarkdownFormat(editorView, format);
  }

  function keepEditorSelection(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <div className="markdown-editor-shell">
      <div className="markdown-format-toolbar" role="toolbar" aria-label="Text formatting">
        <button
          type="button"
          onClick={() => applyFormat('bold')}
          onMouseDown={keepEditorSelection}
          aria-keyshortcuts="Control+B Meta+B"
          aria-label="Bold"
          title="Bold (Ctrl/Cmd+B)"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onClick={() => applyFormat('italic')}
          onMouseDown={keepEditorSelection}
          aria-keyshortcuts="Control+I Meta+I"
          aria-label="Italic"
          title="Italic (Ctrl/Cmd+I)"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          onClick={() => applyFormat('strikethrough')}
          onMouseDown={keepEditorSelection}
          aria-keyshortcuts="Control+Shift+X Meta+Shift+X"
          aria-label="Strikethrough"
          title="Strikethrough (Ctrl/Cmd+Shift+X)"
        >
          <Strikethrough size={16} />
        </button>
        <span className="markdown-format-separator" aria-hidden="true" />
        <button
          type="button"
          onClick={() => editorViewRef.current && toggleChecklist(editorViewRef.current)}
          onMouseDown={keepEditorSelection}
          aria-keyshortcuts="Control+L Meta+L"
          aria-label="Checklist"
          title="Checklist (Ctrl/Cmd+L)"
        >
          <ListTodo size={16} />
        </button>
        <button
          type="button"
          onClick={() => editorViewRef.current && toggleMarkdownList(editorViewRef.current, 'unordered')}
          onMouseDown={keepEditorSelection}
          aria-label="Bulleted list"
          title="Bulleted list"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={() => editorViewRef.current && toggleMarkdownList(editorViewRef.current, 'ordered')}
          onMouseDown={keepEditorSelection}
          aria-label="Numbered list"
          title="Numbered list"
        >
          <ListOrdered size={16} />
        </button>
        <span className="markdown-format-separator" aria-hidden="true" />
        <button
          type="button"
          onClick={() => editorViewRef.current && insertMarkdownLink(editorViewRef.current)}
          onMouseDown={keepEditorSelection}
          aria-label="Link"
          title="Markdown link"
        >
          <Link size={16} />
        </button>
      </div>
      <CodeMirror
        basicSetup={{
          autocompletion: false,
          foldGutter: true,
          highlightActiveLine: true,
          lineNumbers: true,
        }}
        className="markdown-editor"
        extensions={[markdown(), EditorView.lineWrapping, editorCompletions, formattingKeymap]}
        height="100%"
        onChange={onChange}
        onCreateEditor={(view) => {
          editorViewRef.current = view;
          if (initialCursorOffset !== null && initialCursorOffset !== undefined) {
            const cursor = Math.max(0, Math.min(initialCursorOffset, view.state.doc.length));
            view.dispatch({
              effects: EditorView.scrollIntoView(cursor, { y: 'center' }),
              selection: { anchor: cursor },
            });
            window.requestAnimationFrame(() => view.focus());
          }
        }}
        value={value}
      />
    </div>
  );
}
