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
import { compareMarkdown, type EditorEvent, type EditorFocusEvent, type WriteAttempt } from './diagnostics';
import { dismissEditorCaret } from './editorFocus';

type Props = {
  dom?: import('expo/dom').DOMProps;
  fixtureName: string;
  markdown: string;
  session: number;
  keyboardVisible: boolean;
  dismissRevision: number;
  onEvent: (event: EditorEvent) => Promise<void>;
  onEditorFocusChange: (event: EditorFocusEvent) => Promise<void>;
  onWriteAttempt: (attempt: WriteAttempt) => Promise<void>;
  onDraftChange?: (draft: { markdown: string; session: number }) => Promise<void>;
  snapshotRequest: number;
};

export default function EditorSurface({ fixtureName, markdown, onEvent, onEditorFocusChange, onWriteAttempt, onDraftChange, session, snapshotRequest, keyboardVisible, dismissRevision }: Props) {
  const [mode, setMode] = useState<'rich' | 'source'>('rich');
  const [source, setSource] = useState(markdown);
  const [richCompatible, setRichCompatible] = useState(true);
  const [richEditing, setRichEditing] = useState(false);
  const tapStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const revision = useRef(0);
  const startedAt = useRef(performance.now());
  const hydrated = useRef(false);
  const lastSnapshotRequest = useRef(0);
  const lastDismissRevision = useRef(dismissRevision);
  const richBaseline = useRef(markdown);
  const loadedSession = useRef(session);
  const loadingMarkdown = useRef<string | null>(null);
  const richRef = useRef<MDXEditorMethods>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const plugins = useMemo(() => [
    headingsPlugin(), quotePlugin(), listsPlugin(), linkPlugin(), linkDialogPlugin(),
    tablePlugin(), thematicBreakPlugin(), codeBlockPlugin({ defaultCodeBlockLanguage: '' }),
    codeMirrorPlugin({ codeBlockLanguages: { '': 'Plain text', ts: 'TypeScript' }, autoLoadLanguageSupport: false }),
    richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }),
    richBlockBackgroundPlugin(), richCalendarPlugin(), richBlockTouchDragPlugin({ disabled: keyboardVisible || richEditing }), markdownShortcutPlugin(),
  ], [keyboardVisible, richEditing]);

  useEffect(() => {
    if (loadedSession.current === session) return;
    loadedSession.current = session;
    loadingMarkdown.current = markdown;
    richBaseline.current = markdown;
    revision.current = 0;
    startedAt.current = performance.now();
    setSource(markdown);
    setRichCompatible(true);
    setRichEditing(false);
    if (mode === 'rich') richRef.current?.setMarkdown(markdown);
    else setMode('rich');
  }, [markdown, mode, session]);

  const emit = useCallback((kind: EditorEvent['kind'], value: string, message?: string, compareTo?: string) => {
    void onEvent({
      kind, session, fixture: fixtureName, revision: revision.current,
      characters: value.length, elapsedMs: Math.round(performance.now() - startedAt.current),
      comparison: compareTo === undefined ? undefined : compareMarkdown(compareTo, value),
      message,
    });
  }, [fixtureName, onEvent, session]);

  const attemptWrite = useCallback((value: string) => {
    // This fake host has no Drive endpoint. Count calls to the same write
    // boundary a production host would expose; do not persist fixture data.
    void onWriteAttempt({ session, fixture: fixtureName, revision: revision.current, characters: value.length });
  }, [fixtureName, onWriteAttempt, session]);
  const reportFocus = useCallback((focused: boolean) => {
    void onEditorFocusChange({ session, focused });
  }, [onEditorFocusChange, session]);

  useEffect(() => {
    // Expo may replace the callback proxy after each native render. Ready is a
    // per-editor-session event, not an acknowledgement to resend on rerender.
    if (hydrated.current) return;
    hydrated.current = true;
    emit('ready', markdown);
  }, [emit, markdown]);

  useEffect(() => {
    if (snapshotRequest === 0 || snapshotRequest === lastSnapshotRequest.current) return;
    lastSnapshotRequest.current = snapshotRequest;
    emit('snapshot', mode === 'rich' ? richRef.current?.getMarkdown() ?? source : source, undefined, markdown);
  }, [emit, markdown, mode, snapshotRequest, source]);

  useEffect(() => {
    if (dismissRevision === lastDismissRevision.current) return;
    lastDismissRevision.current = dismissRevision;
    if (shellRef.current) dismissEditorCaret(shellRef.current);
    setRichEditing(false);
    tapStart.current = null;
    reportFocus(false);
  }, [dismissRevision, reportFocus]);

  function changeMode(next: 'rich' | 'source') {
    if (next === mode) return;
    if (mode === 'rich') setSource(richRef.current?.getMarkdown() ?? source);
    if (next === 'rich') richBaseline.current = source;
    setMode(next);
  }

  return (
    <div
      ref={shellRef}
      className="prototype-shell rich-markdown-editor-shell"
      onFocusCapture={(event) => {
        if (event.target instanceof Element && event.target.closest('[contenteditable="true"]')) {
          reportFocus(true);
        }
      }}
      onBlurCapture={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest('[contenteditable="true"]')) return;
        const next = event.relatedTarget;
        if (next instanceof Element && next.closest('[contenteditable="true"]') && shellRef.current?.contains(next)) return;
        reportFocus(false);
      }}
    >
      <div className="prototype-switcher">
        <button type="button" onClick={() => changeMode('rich')} aria-pressed={mode === 'rich'} disabled={!richCompatible}>Rich text</button>
        <button type="button" onClick={() => changeMode('source')} aria-pressed={mode === 'source'}>Markdown</button>
        {!richCompatible && <span role="status">Rich import changed meaning; original source retained.</span>}
      </div>
      {mode === 'rich' ? (
        <div
          className={richEditing ? 'prototype-rich-active' : 'prototype-rich-dormant'}
          onTouchStartCapture={(event) => {
            if (richEditing || keyboardVisible || event.touches.length !== 1) return;
            const touch = event.touches[0];
            tapStart.current = { x: touch.clientX, y: touch.clientY, time: performance.now() };
          }}
          onTouchEndCapture={(event) => {
            const start = tapStart.current;
            tapStart.current = null;
            if (!start || richEditing || keyboardVisible || event.changedTouches.length !== 1) return;
            const touch = event.changedTouches[0];
            if (performance.now() - start.time >= 400 || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) return;
            const target = event.target;
            if (!(target instanceof Element) || target.closest('a, button, input, textarea, select, [role="button"], .rich-image-placeholder')) return;
            setRichEditing(true);
            // Let React make the Lexical root editable before placing the caret.
            window.requestAnimationFrame(() => {
              const root = shellRef.current?.querySelector<HTMLElement>('.rich-markdown-content[contenteditable="true"]');
              if (!root) return;
              root.focus();
              const caret = document.caretPositionFromPoint?.(touch.clientX, touch.clientY);
              const range = caret ? document.createRange() : document.caretRangeFromPoint?.(touch.clientX, touch.clientY);
              if (caret && range) {
                range.setStart(caret.offsetNode, caret.offset);
                range.collapse(true);
              }
              if (range && root.contains(range.startContainer)) {
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
              }
            });
          }}
          onTouchCancelCapture={() => { tapStart.current = null; }}
        >
        <MDXEditor
          ref={richRef}
          className="rich-markdown-editor"
          contentEditableClassName="rich-markdown-content markdown-body"
          markdown={source}
          readOnly={!richEditing}
          plugins={plugins}
          onError={({ error }) => emit('error', source, String(error))}
          onChange={(value, initialMarkdownNormalize) => {
            if (loadingMarkdown.current !== null && compareMarkdown(loadingMarkdown.current, value).semanticMatch) {
              loadingMarkdown.current = null;
              return;
            }
            if (initialMarkdownNormalize || !hydrated.current) {
              loadingMarkdown.current = null;
              emit('normalization', value, undefined, richBaseline.current);
              if (!compareMarkdown(richBaseline.current, value).semanticMatch) {
                setRichCompatible(false);
                setMode('source');
              }
              return;
            }
            loadingMarkdown.current = null;
            revision.current += 1;
            emit('user-change', value);
            attemptWrite(value);
            void onDraftChange?.({ markdown: value, session });
          }}
        />
        </div>
      ) : (
        <CodeMirror
          className="prototype-source-editor"
          value={source}
          extensions={[markdownLanguage()]}
          onChange={(value) => {
            setSource(value);
            revision.current += 1;
            emit('user-change', value);
            attemptWrite(value);
            void onDraftChange?.({ markdown: value, session });
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
        .prototype-rich-dormant .rich-markdown-content,
        .prototype-rich-dormant .rich-markdown-content * {
          user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
        }
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
