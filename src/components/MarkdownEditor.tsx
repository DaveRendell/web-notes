import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  return (
    <CodeMirror
      basicSetup={{
        autocompletion: false,
        foldGutter: true,
        highlightActiveLine: true,
        lineNumbers: true,
      }}
      className="markdown-editor"
      extensions={[markdown(), EditorView.lineWrapping]}
      height="100%"
      onChange={onChange}
      value={value}
    />
  );
}
