import { Component, lazy, Suspense, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  areMarkdownBodiesSemanticallyEquivalent,
  checkRichMarkdownCompatibility,
  joinMarkdownEnvelope,
} from '../lib/markdownEnvelope';
import type { VaultNode } from '../types/vault';
import { MarkdownEditor } from './MarkdownEditor';

const RichMarkdownEditor = lazy(() => import('./RichMarkdownEditor'));
const TOOLBAR_INACTIVITY_DELAY_MS = 10_000;
export type NoteEditorMode = 'rich' | 'source';

type NoteEditorShellProps = {
  blockMovementDisabled?: boolean;
  initialCursorOffset?: number | null;
  mode?: NoteEditorMode;
  notes: VaultNode[];
  onBlur?: () => void;
  onChange: (markdown: string) => void;
  onSave: () => void;
  readOnly?: boolean;
  recentNotes: VaultNode[];
  value: string;
};

export function NoteEditorShell(props: NoteEditorShellProps) {
  const compatibility = useMemo(() => checkRichMarkdownCompatibility(props.value), [props.value]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const toolbarTimerRef = useRef<number | null>(null);
  const mode = props.mode ?? (
    props.initialCursorOffset !== null && props.initialCursorOffset !== undefined ? 'source' : 'rich'
  );
  const effectiveMode = mode === 'rich' && compatibility.compatible && !runtimeError ? 'rich' : 'source';
  const fallbackMessage = mode === 'rich' && effectiveMode === 'source'
    ? runtimeError ?? (!compatibility.compatible ? compatibility.reason : null)
    : null;

  const clearToolbarTimer = useCallback(() => {
    if (toolbarTimerRef.current !== null) window.clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = null;
  }, []);

  const showToolbar = useCallback(() => {
    clearToolbarTimer();
    setIsToolbarVisible(true);
    toolbarTimerRef.current = window.setTimeout(() => {
      setIsToolbarVisible(false);
      toolbarTimerRef.current = null;
    }, TOOLBAR_INACTIVITY_DELAY_MS);
  }, [clearToolbarTimer]);

  const handleRichActiveChange = useCallback((active: boolean) => {
    if (active) showToolbar();
    else {
      clearToolbarTimer();
      setIsToolbarVisible(false);
    }
  }, [clearToolbarTimer, showToolbar]);

  const handleRichSave = () => {
    clearToolbarTimer();
    setIsToolbarVisible(false);
    props.onSave();
  };

  useEffect(() => clearToolbarTimer, [clearToolbarTimer]);

  const controlsVisible = effectiveMode === 'source' || isToolbarVisible || Boolean(fallbackMessage);

  return (
    <div className={`note-editor-shell${controlsVisible ? ' controls-visible' : ''}`}>
      {fallbackMessage && <div className="editor-mode-notice editor-mode-fallback" role="status">{fallbackMessage}</div>}

      {effectiveMode === 'rich' && compatibility.compatible ? (
        <RichEditorErrorBoundary onError={() => setRuntimeError('Rich text editing could not load. Markdown mode is being used.')}>
          <Suspense fallback={<div className="editor-loading" role="status">Loading rich text editor…</div>}>
            <RichMarkdownEditor
              blockMovementDisabled={props.blockMovementDisabled}
              markdown={compatibility.envelope.bodySource}
              notes={props.notes}
              onChange={(body) => props.onChange(joinMarkdownEnvelope(compatibility.envelope, body))}
              onError={(message) => setRuntimeError(`Rich text could not safely parse this note: ${message}`)}
              onInitialNormalize={(normalizedBody) => {
                if (!areMarkdownBodiesSemanticallyEquivalent(compatibility.envelope.bodySource, normalizedBody)) {
                  console.warn('Rich text normalization changed Markdown semantics.', {
                    normalizedBody,
                    originalBody: compatibility.envelope.bodySource,
                  });
                  setRuntimeError('Rich text normalization changed this note, so Markdown mode is being used.');
                }
              }}
              onActiveChange={handleRichActiveChange}
              onActivity={showToolbar}
              onBlur={props.onBlur}
              onSave={handleRichSave}
              readOnly={props.readOnly}
              recentNotes={props.recentNotes}
              spellCheck={isToolbarVisible}
            />
          </Suspense>
        </RichEditorErrorBoundary>
      ) : (
        <MarkdownEditor {...props} />
      )}
    </div>
  );
}

class RichEditorErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Rich text editor failed; falling back to Markdown mode.', error, info);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
