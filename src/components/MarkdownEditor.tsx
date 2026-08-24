import { autocompletion } from '@codemirror/autocomplete';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { useMemo } from 'react';
import { createEmojiCompletionSource } from '../lib/emojiCompletion';
import { createWikilinkCompletionSource } from '../lib/wikilinkCompletion';
import type { VaultNode } from '../types/vault';

type MarkdownEditorProps = {
  notes: VaultNode[];
  value: string;
  onChange: (value: string) => void;
  recentNotes: VaultNode[];
};

export function MarkdownEditor({ notes, value, onChange, recentNotes }: MarkdownEditorProps) {
  const editorCompletions = useMemo(
    () => autocompletion({
      override: [createWikilinkCompletionSource(notes, recentNotes), createEmojiCompletionSource()],
    }),
    [notes, recentNotes],
  );

  return (
    <CodeMirror
      basicSetup={{
        autocompletion: false,
        foldGutter: true,
        highlightActiveLine: true,
        lineNumbers: true,
      }}
      className="markdown-editor"
      extensions={[markdown(), EditorView.lineWrapping, editorCompletions]}
      height="100%"
      onChange={onChange}
      value={value}
    />
  );
}
