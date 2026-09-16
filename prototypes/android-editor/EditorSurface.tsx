'use dom';

import '@mdxeditor/editor/style.css';
import { MDXEditor, headingsPlugin, linkDialogPlugin, linkPlugin, listsPlugin, quotePlugin, tablePlugin, codeBlockPlugin, codeMirrorPlugin, thematicBreakPlugin, markdownShortcutPlugin, type MDXEditorMethods } from '@mdxeditor/editor';
import CodeMirror from '@uiw/react-codemirror';
import { markdown as markdownLanguage } from '@codemirror/lang-markdown';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { richEditorEnhancementsPlugin } from '../../src/components/richEditorEnhancements';
import { richBlockBackgroundPlugin } from '../../src/components/richBlockBackground';
import { richBlockTouchDragPlugin } from '../../src/components/richBlockTouchDrag';
import { richCalendarPlugin } from '../../src/components/richCalendar';

type EditorEvent = {
  kind: 'ready' | 'normalization' | 'user-change' | 'snapshot' | 'error';
  fixture: string;
  revision: number;
  characters: number;
  elapsedMs: number;
  message?: string;
};

type Props = {
  dom?: import('expo/dom').DOMProps;
  fixtureName: string;
  markdown: string;
  onEvent: (event: EditorEvent) => Promise<void>;
  snapshotRequest: number;
};

export default function EditorSurface({ fixtureName, markdown, onEvent, snapshotRequest }: Props) {
  const [mode, setMode] = useState<'rich' | 'source'>('rich');
  const [source, setSource] = useState(markdown);
  const revision = useRef(0);
  const startedAt = useRef(performance.now());
  const hydrated = useRef(false);
  const lastSnapshotRequest = useRef(0);
  const richRef = useRef<MDXEditorMethods>(null);
  const plugins = useMemo(() => [
    headingsPlugin(), quotePlugin(), listsPlugin(), linkPlugin(), linkDialogPlugin(),
    tablePlugin(), thematicBreakPlugin(), codeBlockPlugin({ defaultCodeBlockLanguage: '' }),
    codeMirrorPlugin({ codeBlockLanguages: { '': 'Plain text', ts: 'TypeScript' }, autoLoadLanguageSupport: false }),
    richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }),
    richBlockBackgroundPlugin(), richCalendarPlugin(), richBlockTouchDragPlugin(), markdownShortcutPlugin(),
  ], []);

  const emit = useCallback((kind: EditorEvent['kind'], value: string, message?: string) => {
    void onEvent({
      kind, fixture: fixtureName, revision: revision.current,
      characters: value.length, elapsedMs: Math.round(performance.now() - startedAt.current),
      message,
    });
  }, [fixtureName, onEvent]);

  useEffect(() => {
    hydrated.current = true;
    emit('ready', markdown);
  }, [emit, markdown]);

  useEffect(() => {
    if (snapshotRequest === 0 || snapshotRequest === lastSnapshotRequest.current) return;
    lastSnapshotRequest.current = snapshotRequest;
    emit('snapshot', mode === 'rich' ? richRef.current?.getMarkdown() ?? source : source);
  }, [emit, mode, snapshotRequest, source]);

  function changeMode(next: 'rich' | 'source') {
    if (next === mode) return;
    if (mode === 'rich') setSource(richRef.current?.getMarkdown() ?? source);
    setMode(next);
  }

  return (
    <div className="prototype-shell rich-markdown-editor-shell">
      <div className="prototype-switcher">
        <button type="button" onClick={() => changeMode('rich')} aria-pressed={mode === 'rich'}>Rich text</button>
        <button type="button" onClick={() => changeMode('source')} aria-pressed={mode === 'source'}>Markdown</button>
      </div>
      {mode === 'rich' ? (
        <MDXEditor
          ref={richRef}
          className="rich-markdown-editor"
          contentEditableClassName="rich-markdown-content markdown-body"
          markdown={source}
          plugins={plugins}
          onError={({ error }) => emit('error', source, String(error))}
          onChange={(value, initialMarkdownNormalize) => {
            if (initialMarkdownNormalize || !hydrated.current) {
              emit('normalization', value);
              return;
            }
            revision.current += 1;
            emit('user-change', value);
          }}
        />
      ) : (
        <CodeMirror
          className="prototype-source-editor"
          value={source}
          extensions={[markdownLanguage()]}
          onChange={(value) => {
            setSource(value);
            revision.current += 1;
            emit('user-change', value);
          }}
        />
      )}
      <style>{`
        html, body, #root { margin: 0; height: 100%; }
        body { color: #19291d; font-family: system-ui, sans-serif; }
        .prototype-shell { height: 100dvh; overflow: auto; }
        .prototype-switcher { position: sticky; top: 0; display: flex; gap: 8px; padding: 8px;
          background: #f6f7f5; z-index: 2; border-bottom: 1px solid #d8ddd6; }
        .prototype-switcher button { border: 0; border-radius: 6px; padding: 8px 12px; background: #e8ece6; }
        .prototype-switcher button[aria-pressed="true"] { background: #c9ddcb; }
        .mdxeditor { padding: 12px; }
        .prototype-source-editor .cm-editor { min-height: calc(100dvh - 56px); }
        .twemoji { display: inline-block; width: 1em; height: 1em; margin: 0 0.04em;
          vertical-align: -0.1em; object-fit: contain; }
        .rich-touch-drag-pending, .rich-touch-drag-pending *,
        .rich-touch-drag-active, .rich-touch-drag-active * {
          user-select: none !important; -webkit-user-select: none !important;
          -webkit-touch-callout: none; }
        .rich-touch-drag-source { opacity: 0.45; }
        .rich-markdown-content > *, .rich-markdown-content li { position: relative; }
        .rich-touch-drop-before::before, .rich-touch-drop-after::after { position: absolute;
          z-index: 5; left: 0; right: 0; height: 3px; border-radius: 3px;
          background: #3478a7; content: ''; pointer-events: none; }
        .rich-touch-drop-before::before { top: -4px; }
        .rich-touch-drop-after::after { bottom: -4px; }
        .rich-touch-drop-nest { border-radius: 5px; box-shadow: inset 0 0 0 3px #3478a7;
          background: #e7f1f8; }
        .rich-touch-drag-status { position: fixed; left: 50%; bottom: 12px; z-index: 10;
          transform: translateX(-50%); border-radius: 18px; padding: 8px 12px;
          background: #183f59; color: white; font-size: 13px; pointer-events: none; }
        .rich-image-placeholder { display: flex; align-items: center; gap: 12px; min-height: 80px;
          padding: 12px; border: 1px dashed #9aa3b2; border-radius: 8px; background: #f7f8fa; }
        .rich-image-placeholder > span { display: flex; flex-direction: column; }
        .prototype-calendar-widget { padding: 12px; border: 1px solid #9aa3b2; border-radius: 8px; }
        [data-block-background="green"] { --block-bg: #dfedde; }
        [data-block-background="blue"] { --block-bg: #dcebf6; }
        .rich-markdown-content [data-block-background] { border-radius: 4px; background: var(--block-bg);
          box-shadow: 0 0 0 4px var(--block-bg); }
      `}</style>
    </div>
  );
}
