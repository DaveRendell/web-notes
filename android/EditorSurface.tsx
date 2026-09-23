'use dom';

import '@mdxeditor/editor/style.css';
import { MDXEditor, headingsPlugin, linkDialogPlugin, linkPlugin, listsPlugin, quotePlugin, tablePlugin, codeBlockPlugin, codeMirrorPlugin, thematicBreakPlugin, markdownShortcutPlugin, toolbarPlugin, type MDXEditorMethods } from '@mdxeditor/editor';
import CodeMirror from '@uiw/react-codemirror';
import { autocompletion } from '@codemirror/autocomplete';
import { markdown as markdownLanguage } from '@codemirror/lang-markdown';
import type { EditorView } from '@codemirror/view';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { richEditorEnhancementsPlugin } from '../web/src/components/richEditorEnhancements';
import { richBlockBackgroundPlugin } from '../web/src/components/richBlockBackground';
import { richBlockTouchDragPlugin } from '../web/src/components/richBlockTouchDrag';
import { richCalendarPlugin } from '../web/src/components/richCalendar';
import { RichInsertImageButton } from '../web/src/components/RichInsertImageButton';
import { RichInsertCalendarButton } from '../web/src/components/RichInsertCalendarButton';
import { InsertImageButton } from '../web/src/components/InsertImageButton';
import { InsertCalendarButton } from '../web/src/components/InsertCalendarButton';
import { compareMarkdown, type EditorEvent, type EditorFocusEvent, type WriteAttempt } from './diagnostics';
import { dismissEditorCaret } from './editorFocus';
import { createSlashCommandCompletionSource, requestCalendarDialog, requestImageDialog } from '../web/src/lib/slashCommands';
import { MOBILE_BLOCK_BACKGROUND_CSS, MOBILE_SLASH_COMMAND_IDS } from './mobileSlashCommands';
import type { MobileEditorMode } from './autosave';
import { MobileImageProvider, type MobileImage, type MobileImageServices } from './shims/ImageContext';
import { MobileCalendarProvider, type MobileCalendarServices } from './shims/CalendarContext';
import type { CalendarWidgetConfig } from '../web/src/lib/calendarWidget';
import type { GoogleCalendarEvent, GoogleCalendarListEntry } from '../web/src/lib/googleCalendar';
import { calendarWidgetInsertion } from '../web/src/lib/calendarWidget';

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
  onDraftChange?: (draft: { markdown: string; mode: MobileEditorMode; session: number }) => Promise<void>;
  snapshotRequest: number;
  requestedMode?: MobileEditorMode;
  darkMode: boolean;
  onModeChange?: (mode: MobileEditorMode) => void;
  images: MobileImage[];
  onLoadImage: (source: string) => Promise<{ dataUrl: string }>;
  onUploadImage: (image: { name: string; mimeType: string; base64: string }) => Promise<MobileImage>;
  calendarConnected: boolean;
  onCalendarConnect: () => Promise<GoogleCalendarListEntry[]>;
  onCalendarList: () => Promise<GoogleCalendarListEntry[]>;
  onCalendarEvents: (config: CalendarWidgetConfig) => Promise<{ events: GoogleCalendarEvent[]; errors: Array<{ calendarId: string; message: string; status?: number }> }>;
  onOpenExternal: (url: string) => Promise<void>;
};

export default function EditorSurface({ fixtureName, markdown, onEvent, onEditorFocusChange, onWriteAttempt, onDraftChange, session, snapshotRequest, keyboardVisible, dismissRevision, requestedMode = 'rich', darkMode, onModeChange, images, onLoadImage, onUploadImage, calendarConnected, onCalendarConnect, onCalendarList, onCalendarEvents, onOpenExternal }: Props) {
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
  const sourceViewRef = useRef<EditorView | null>(null);
  const sourceBookmark = useRef({ from: 0, to: 0 });
  const imageServices = useMemo<MobileImageServices>(() => ({
    images,
    scope: `${fixtureName}:${session}`,
    online: true,
    load: async (source) => fetch((await onLoadImage(source)).dataUrl).then((response) => response.blob()),
    upload: async (file) => onUploadImage({ name: file.name, mimeType: file.type, base64: await fileToBase64(file) }),
    version: () => undefined,
  }), [fixtureName, images, onLoadImage, onUploadImage, session]);
  const calendarServices = useMemo<MobileCalendarServices>(() => ({
    connected: calendarConnected,
    connect: onCalendarConnect,
    listCalendars: onCalendarList,
    loadEvents: onCalendarEvents,
    openExternal: onOpenExternal,
  }), [calendarConnected, onCalendarConnect, onCalendarEvents, onCalendarList, onOpenExternal]);
  const plugins = useMemo(() => [
    headingsPlugin(), quotePlugin(), listsPlugin(), linkPlugin(), linkDialogPlugin(),
    tablePlugin(), thematicBreakPlugin(), codeBlockPlugin({ defaultCodeBlockLanguage: '' }),
    codeMirrorPlugin({ codeBlockLanguages: { '': 'Plain text', ts: 'TypeScript' }, autoLoadLanguageSupport: false }),
    richEditorEnhancementsPlugin({ notes: [], recentNotes: [], slashCommandIds: MOBILE_SLASH_COMMAND_IDS }),
    richBlockBackgroundPlugin(), richCalendarPlugin(), richBlockTouchDragPlugin({ disabled: keyboardVisible || richEditing }), markdownShortcutPlugin(),
    toolbarPlugin({
      toolbarClassName: 'rich-markdown-toolbar',
      toolbarContents: () => <><RichInsertImageButton pasteTarget={shellRef} disabled={!richEditing} /><RichInsertCalendarButton pasteTarget={shellRef} disabled={!richEditing} /></>,
    }),
  ], [keyboardVisible, richEditing]);
  const sourceSlashCompletion = useMemo(() => autocompletion({
    override: [createSlashCommandCompletionSource(() => {
      rememberSourceSelection();
      requestImageDialog(shellRef.current);
    }, () => {
      rememberSourceSelection();
      requestCalendarDialog(shellRef.current);
    }, MOBILE_SLASH_COMMAND_IDS)],
  }), []);

  function rememberSourceSelection() {
    const selection = sourceViewRef.current?.state.selection.main;
    if (selection) sourceBookmark.current = { from: selection.from, to: selection.to };
  }

  function insertSourceText(value: string, cursorOffset = value.length) {
    const view = sourceViewRef.current;
    if (!view) return;
    const { from, to } = sourceBookmark.current;
    view.dispatch({ changes: { from, to, insert: value }, selection: { anchor: from + cursorOffset } });
    view.focus();
  }

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
    onModeChange?.(next);
  }

  useEffect(() => {
    if (requestedMode !== mode) changeMode(requestedMode);
  // Changing mode needs the current editor contents, so it deliberately does
  // not run again merely because the editor's draft changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedMode]);

  return (
    <MobileCalendarProvider services={calendarServices}>
    <MobileImageProvider value={imageServices}>
    <div
      ref={shellRef}
      className={`prototype-shell rich-markdown-editor-shell${darkMode ? ' dark-theme' : ''}`}
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
      {!richCompatible && <div className="prototype-editor-status" role="status">Rich import changed meaning; Markdown source is being used.</div>}
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
          className={`rich-markdown-editor${darkMode ? ' dark-theme' : ''}`}
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
                onModeChange?.('source');
              }
              return;
            }
            loadingMarkdown.current = null;
            revision.current += 1;
            emit('user-change', value);
            attemptWrite(value);
            void onDraftChange?.({ markdown: value, mode: 'rich', session });
          }}
        />
        </div>
      ) : (
        <CodeMirror
          className="prototype-source-editor"
          theme={darkMode ? 'dark' : 'light'}
          value={source}
          extensions={[markdownLanguage(), sourceSlashCompletion]}
          onCreateEditor={(view) => { sourceViewRef.current = view; }}
          onChange={(value) => {
            setSource(value);
            revision.current += 1;
            emit('user-change', value);
            attemptWrite(value);
            void onDraftChange?.({ markdown: value, mode: 'source', session });
          }}
        />
      )}
      {mode === 'source' && <div className="source-insert-actions">
        <InsertImageButton pasteTarget={shellRef} onOpen={rememberSourceSelection} onInsert={(value) => insertSourceText(value)} />
        <InsertCalendarButton pasteTarget={shellRef} onOpen={rememberSourceSelection} onInsert={(config) => {
          const view = sourceViewRef.current;
          if (!view) return;
          const { from, to } = sourceBookmark.current;
          const insertion = calendarWidgetInsertion(view.state.doc.toString(), from, to, config);
          insertSourceText(insertion.insert, insertion.cursor - from);
        }} />
      </div>}
      <style>{`
        html, body, #root { margin: 0; height: 100%; }
        :root { color-scheme: ${darkMode ? 'dark' : 'light'}; }
        body { color: ${darkMode ? '#e7ebf0' : '#202124'}; background: ${darkMode ? '#181e25' : '#ffffff'}; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .prototype-shell { height: 100%; overflow: auto; }
        .prototype-editor-status { padding: 8px 14px; color: #8a4d1e; background: #fff7e8; font-size: 13px; }
        .mdxeditor { padding: 12px; }
        /* The toolbar components remain mounted as invisible dialog hosts for
           /image and /calendar. display: contents avoids a floating toolbar
           or any layout space while keeping their slash-command event hooks. */
        .rich-markdown-toolbar { display: contents; }
        .rich-markdown-toolbar .rich-toolbar-action,
        .source-insert-actions > .rich-toolbar-action { display: none; }
        .prototype-rich-dormant .rich-markdown-content,
        .prototype-rich-dormant .rich-markdown-content * {
          user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
        }
        .prototype-source-editor .cm-editor { min-height: calc(100dvh - 56px); }
        .rich-completion-anchor { z-index: 20; }
        .rich-completion-menu { display: grid; gap: 2px; min-width: min(270px, calc(100vw - 24px));
          max-width: calc(100vw - 24px); max-height: min(300px, 45dvh); overflow-y: auto;
          padding: 4px; border: 1px solid #dfe3ea; border-radius: 8px;
          background: #ffffff; box-shadow: 0 10px 28px #1e263029; font-family: system-ui, sans-serif; }
        .rich-completion-menu button { display: flex; flex-direction: column; justify-content: center;
          min-height: 44px; gap: 2px; padding: 6px 10px; border: 0; border-radius: 6px;
          background: transparent; color: #202124; font: inherit; text-align: left; }
        .rich-completion-menu button.active, .rich-completion-menu button:focus-visible {
          background: #eef3f7; color: #183f59; outline: none; }
        .rich-completion-menu button span, .rich-completion-menu button small {
          overflow: hidden; max-width: 100%; text-overflow: ellipsis; white-space: nowrap; }
        .rich-completion-menu button small { color: #697180; font-size: 12px; }
        .prototype-source-editor .cm-tooltip-autocomplete { z-index: 20; overflow: hidden;
          max-width: calc(100vw - 24px); border: 1px solid #dfe3ea; border-radius: 8px;
          background: #ffffff; box-shadow: 0 10px 28px #1e263029; }
        .prototype-source-editor .cm-tooltip-autocomplete > ul { max-height: min(300px, 45dvh);
          font-family: system-ui, sans-serif; }
        .prototype-source-editor .cm-tooltip-autocomplete > ul > li { display: flex;
          align-items: center; min-height: 44px; padding: 4px 10px; color: #202124; }
        .prototype-source-editor .cm-tooltip-autocomplete > ul > li[aria-selected="true"] {
          background: #eef3f7; color: #183f59; }
        .prototype-source-editor .cm-completionDetail { color: #697180; }
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
        .note-image { display: block; max-width: 100%; height: auto; border-radius: 5px; }
        .rich-calendar-node { margin: 12px 0; }
        .calendar-widget { overflow: hidden; border: 1px solid #d7dde4; border-radius: 9px; background: #fff; }
        .calendar-widget > header { display: flex; min-height: 44px; align-items: center; justify-content: space-between;
          gap: 8px; padding: 6px 10px; border-bottom: 1px solid #e7ebef; background: #f5f7f9; }
        .calendar-widget-title, .calendar-widget-actions, .calendar-widget-message[role="status"], .calendar-event-link { display: inline-flex; align-items: center; }
        .calendar-widget-title { gap: 7px; }
        .calendar-widget-actions { gap: 2px; }
        .calendar-widget button { border: 0; border-radius: 5px; background: transparent; color: #536173; }
        .calendar-widget-actions button { display: inline-flex; width: 36px; height: 36px; align-items: center; justify-content: center; }
        .calendar-widget-message { margin: 0; padding: 16px; color: #647180; }
        .calendar-widget-message button { min-height: 38px; padding: 7px 10px; background: #e5edf3; color: #183f59; }
        .calendar-event-list { margin: 0; padding: 7px 12px; list-style: none; }
        .calendar-event-list li { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 7px; margin: 0; padding: 2px 0; min-width: 0; }
        .calendar-event-when { color: #697586; font-size: 12px; white-space: nowrap; }
        .calendar-event-details { display: block; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .calendar-event-link { display: inline-flex; max-width: 100%; gap: 4px; overflow: hidden; padding: 0; color: #225f87 !important; font: inherit; font-weight: 600 !important; text-align: left; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; }
        .calendar-event-link svg { flex: 0 0 auto; }
        .calendar-event-details strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .calendar-widget-warning { margin: 0; padding: 8px 12px; border-top: 1px solid #ead7aa; background: #fff6df; color: #805c15; font-size: 12px; }
        .app-modal-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 16px; background: #0006; }
        .app-modal, .calendar-dialog { width: min(560px, calc(100vw - 24px)); max-height: calc(100dvh - 32px); overflow: auto;
          border: 0; border-radius: 10px; background: white; color: #202124; }
        .app-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #dfe3ea; }
        .app-modal-header h2 { margin: 0; font-size: 18px; }
        .calendar-dialog-fields { display: grid; gap: 16px; padding: 18px; }
        .calendar-dialog-fields label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
        .calendar-dialog-fields input { min-width: 0; padding: 9px; border: 1px solid #cbd3dc; border-radius: 6px; font: inherit; }
        .calendar-date-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .calendar-options { display: grid; max-height: 240px; overflow: auto; gap: 2px; margin: 0; padding: 9px; border: 1px solid #dce2e8; border-radius: 8px; }
        .calendar-options > label { grid-template-columns: auto 10px minmax(0, 1fr); align-items: center; padding: 5px; }
        .calendar-option-dot { width: 9px; height: 9px; border-radius: 50%; background: #4c7fa5; }
        .calendar-manual-add { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; margin-top: 8px; }
        .app-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .app-modal-actions button { min-width: 88px; min-height: 40px; }
        .app-modal-actions .primary-button { background: #24577a; color: white; }
        .image-dialog { width: min(460px, calc(100vw - 24px)); max-height: calc(100dvh - 32px); overflow: auto;
          border: 0; border-radius: 10px; padding: 20px; background: #fff; color: #202124; }
        .image-dialog::backdrop { background: #0006; }
        .image-dialog form, .image-dialog label { display: flex; flex-direction: column; gap: 9px; }
        .image-dialog form { gap: 16px; }
        .image-dialog input, .image-dialog select { min-width: 0; padding: 9px; border: 1px solid #cbd3dc; border-radius: 6px; font: inherit; }
        .prototype-shell.dark-theme { color: #e7ebf0; background: #181e25; }
        .prototype-shell.dark-theme .rich-markdown-editor {
          --baseBase: #181e25; --baseBgSubtle: #202832; --baseBg: #26313d;
          --baseText: #e7ebf0; --baseTextContrast: #ffffff;
          --accentBgSubtle: #21394a; --accentBg: #2c536d; --accentTextContrast: #ffffff;
          border-color: #2b3643; background: #181e25; color: #e7ebf0;
        }
        .prototype-shell.dark-theme .rich-markdown-content { color: #dce3ea; caret-color: #ffffff; }
        .prototype-shell.dark-theme .prototype-editor-status { color: #e5bd79; background: #3a3020; }
        .prototype-shell.dark-theme .rich-completion-menu,
        .prototype-shell.dark-theme .prototype-source-editor .cm-tooltip-autocomplete {
          border-color: #344250; background: #1a222b; box-shadow: 0 10px 28px #0008;
        }
        .prototype-shell.dark-theme .rich-completion-menu button,
        .prototype-shell.dark-theme .prototype-source-editor .cm-tooltip-autocomplete > ul > li { color: #e7ebf0; }
        .prototype-shell.dark-theme .rich-completion-menu button.active,
        .prototype-shell.dark-theme .rich-completion-menu button:focus-visible,
        .prototype-shell.dark-theme .prototype-source-editor .cm-tooltip-autocomplete > ul > li[aria-selected="true"] {
          background: #27485e; color: #ffffff;
        }
        .prototype-shell.dark-theme .rich-completion-menu button small,
        .prototype-shell.dark-theme .prototype-source-editor .cm-completionDetail { color: #a8b3bf; }
        .prototype-shell.dark-theme .rich-touch-drop-nest { background: #263d50; }
        .prototype-shell.dark-theme .rich-image-placeholder { border-color: #596273; background: #202630; color: #aeb8c8; }
        .prototype-shell.dark-theme .calendar-widget { border-color: #3b4654; background: #252d38; color: #e2e7ed; }
        .prototype-shell.dark-theme .calendar-widget > header { border-color: #3b4654; background: #2d3743; }
        .prototype-shell.dark-theme .calendar-widget button { color: #b2bdca; }
        .prototype-shell.dark-theme .calendar-event-when,
        .prototype-shell.dark-theme .calendar-widget-message { color: #a8b3bf; }
        .prototype-shell.dark-theme .calendar-event-link { color: #8ec5ea !important; }
        .prototype-shell.dark-theme .calendar-widget-message button { background: #263d50; color: #dceefa; }
        .prototype-shell.dark-theme .calendar-widget-warning { border-color: #695629; background: #41391f; color: #e2c873; }
        .rich-markdown-content hr { height: 1px; margin-block: 1.25rem; border: 0; background: #aeb8c2; }
        .prototype-shell.dark-theme .rich-markdown-content hr { background: #5b6875; }
        .prototype-shell.dark-theme .app-modal,
        .prototype-shell.dark-theme .calendar-dialog,
        .prototype-shell.dark-theme .image-dialog { background: #202938; color: #e7ebf0; }
        .prototype-shell.dark-theme .app-modal-header { border-color: #3b4654; }
        .prototype-shell.dark-theme .calendar-dialog-fields input,
        .prototype-shell.dark-theme .image-dialog input,
        .prototype-shell.dark-theme .image-dialog select,
        .prototype-shell.dark-theme .calendar-options { border-color: #4a5664; background: #181e25; color: #e7ebf0; }
        .prototype-shell.dark-theme .app-modal-actions button:not(.primary-button) { background: #2d3743; color: #e7ebf0; }
        ${MOBILE_BLOCK_BACKGROUND_CSS}
      `}</style>
    </div>
    </MobileImageProvider>
    </MobileCalendarProvider>
  );
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
