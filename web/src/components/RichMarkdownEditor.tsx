import '@mdxeditor/editor/style.css';
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  Separator,
  StrikeThroughSupSubToggles,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from '@mdxeditor/editor';
import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { refreshContentEditableSpellcheck } from '../lib/contentEditableSpellcheck';
import type { VaultNode } from '../types/vault';
import { decodeWikiLinkUrl, richEditorEnhancementsPlugin } from './richEditorEnhancements';
import { richBlockDragPlugin } from './richBlockDrag';
import { richBlockBackgroundPlugin } from './richBlockBackground';
import { richEditorIcon } from './richEditorIcons';
import { RichInsertImageButton } from './RichInsertImageButton';
import { RichInsertCalendarButton } from './RichInsertCalendarButton';
import { richCalendarPlugin } from './richCalendar';

type RichMarkdownEditorProps = {
  markdown: string;
  blockMovementDisabled?: boolean;
  notes: VaultNode[];
  onActiveChange: (active: boolean) => void;
  onActivity: () => void;
  onBlur?: () => void;
  onChange: (markdown: string) => void;
  onError: (message: string) => void;
  onInitialNormalize: (markdown: string) => void;
  onOpenWikilink?: (target: string, newTab: boolean) => void;
  onSave: () => void;
  readOnly?: boolean;
  recentNotes: VaultNode[];
  spellCheck: boolean;
};

export default function RichMarkdownEditor({ markdown, blockMovementDisabled = false, notes, onActiveChange, onActivity, onBlur, onChange, onError, onInitialNormalize, onOpenWikilink, onSave, readOnly = false, recentNotes, spellCheck }: RichMarkdownEditorProps) {
  const { theme } = useTheme();
  const editorRef = useRef<MDXEditorMethods>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const activeTableRef = useRef<HTMLTableElement | null>(null);
  const refreshingSpellcheckRef = useRef(false);
  const lastEmittedMarkdownRef = useRef(markdown);
  const plugins = useMemo(() => [
    headingsPlugin(),
    quotePlugin(),
    listsPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    tablePlugin(),
    thematicBreakPlugin(),
    codeBlockPlugin({ defaultCodeBlockLanguage: '' }),
    codeMirrorPlugin({ codeBlockLanguages: { '': 'Plain text' }, autoLoadLanguageSupport: false }),
    richEditorEnhancementsPlugin({ notes, recentNotes }),
    richBlockBackgroundPlugin(),
    richCalendarPlugin(),
    richBlockDragPlugin({ disabled: blockMovementDisabled || readOnly }),
    markdownShortcutPlugin(),
    toolbarPlugin({
      toolbarClassName: 'rich-markdown-toolbar',
      toolbarContents: () => (
        <>
          <UndoRedo />
          <Separator />
          <BlockTypeSelect />
          <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
          <StrikeThroughSupSubToggles options={['Strikethrough']} />
          <CodeToggle />
          <Separator />
          <ListsToggle options={['bullet', 'number', 'check']} />
          <CreateLink />
          <RichInsertImageButton pasteTarget={shellRef} disabled={readOnly} />
          <RichInsertCalendarButton pasteTarget={shellRef} disabled={readOnly} />
          <InsertTable />
          <InsertCodeBlock />
          <InsertThematicBreak />
        </>
      ),
    }),
  ], [blockMovementDisabled, notes, readOnly, recentNotes]);

  useEffect(() => {
    if (markdown === lastEmittedMarkdownRef.current) return;
    lastEmittedMarkdownRef.current = markdown;
    editorRef.current?.setMarkdown(markdown);
  }, [markdown]);

  useEffect(() => {
    if (spellCheck) return;
    const editable = shellRef.current?.querySelector<HTMLElement>('[contenteditable="true"][data-lexical-editor="true"]');
    const focusedElement = document.activeElement;
    if (!editable || !(focusedElement instanceof HTMLElement) || !shellRef.current?.contains(focusedElement)) return;

    refreshingSpellcheckRef.current = true;
    const cancelRefresh = refreshContentEditableSpellcheck(editable, () => {
      refreshingSpellcheckRef.current = false;
    }, focusedElement);
    if (!cancelRefresh) refreshingSpellcheckRef.current = false;
    return cancelRefresh ?? undefined;
  }, [spellCheck]);

  function clearActiveTable() {
    activeTableRef.current?.removeAttribute('data-web-notes-controls-active');
    activeTableRef.current = null;
  }

  function updateActiveTable(target: EventTarget | null) {
    if (!(target instanceof Element)) return;

    const table = target.closest<HTMLTableElement>('.rich-markdown-content table');
    if (table && shellRef.current?.contains(table)) {
      if (activeTableRef.current !== table) {
        clearActiveTable();
        table.setAttribute('data-web-notes-controls-active', 'true');
        activeTableRef.current = table;
      }
      return;
    }

    // MDXEditor portals row and column menus outside the table. Keep their
    // anchor table active while one of those menus is open.
    if (activeTableRef.current?.querySelector('[data-state="open"]')) return;
    clearActiveTable();
  }

  function openWikilink(event: ReactMouseEvent, newTab: boolean) {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>('a[href^="web-notes-wikilink:"]');
    if (!anchor) return;
    const target = decodeWikiLinkUrl(anchor.getAttribute('href') ?? '')?.target;
    if (!target || !onOpenWikilink) return;
    event.preventDefault();
    onOpenWikilink(target, newTab);
  }

  return (
    <div
      ref={shellRef}
      className="rich-markdown-editor-shell"
      onClickCapture={(event) => openWikilink(event, event.ctrlKey || event.metaKey)}
      onAuxClickCapture={(event) => {
        if (event.button === 1) openWikilink(event, true);
      }}
      onBlurCapture={(event) => {
        if (refreshingSpellcheckRef.current) return;
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        clearActiveTable();
        onActiveChange(false);
        onBlur?.();
      }}
      onFocusCapture={(event) => {
        updateActiveTable(event.target);
        if (!refreshingSpellcheckRef.current) onActiveChange(true);
      }}
      onPointerDownCapture={(event) => {
        preserveChecklistTextCaret(event);
        onActivity();
      }}
      onKeyDownCapture={(event) => {
        onActivity();
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          onSave();
        }
      }}
    >
      <MDXEditor
        ref={editorRef}
        className={`rich-markdown-editor mdxeditor-full-height${theme === 'dark' ? ' dark-theme' : ''}`}
        contentEditableClassName="rich-markdown-content markdown-body"
        iconComponentFor={richEditorIcon}
        markdown={markdown}
        readOnly={readOnly}
        spellCheck={spellCheck}
        onChange={(nextMarkdown, initialMarkdownNormalize) => {
          if (initialMarkdownNormalize) onInitialNormalize(nextMarkdown);
          else {
            onActivity();
            lastEmittedMarkdownRef.current = nextMarkdown;
            onChange(nextMarkdown);
          }
        }}
        onError={({ error }) => onError(error)}
        plugins={plugins}
      />
    </div>
  );
}

/**
 * Lexical makes checklist rows programmatically focusable so their marker can
 * be toggled with Space. Firefox also focuses that row when its ordinary text
 * is clicked, which leaves the apparent caret attached to the checkbox. Make
 * text clicks follow normal contenteditable focus while retaining the marker's
 * keyboard behaviour.
 */
export function preserveChecklistTextCaret(event: Pick<ReactPointerEvent, 'target' | 'clientX'>) {
  if (!(event.target instanceof HTMLElement)) return;
  const item = event.target.closest<HTMLElement>('li[role="checkbox"]');
  if (!item || event.target !== item || item.getAttribute('tabindex') === null) return;

  const rect = item.getBoundingClientRect();
  const markerWidth = Number.parseFloat(getComputedStyle(item, '::before').width) || 16;
  const clickedMarker = item.dir === 'rtl'
    ? event.clientX >= rect.right - markerWidth && event.clientX <= rect.right
    : event.clientX >= rect.left && event.clientX <= rect.left + markerWidth;
  if (clickedMarker) return;

  const tabIndex = item.getAttribute('tabindex')!;
  item.removeAttribute('tabindex');
  window.setTimeout(() => {
    if (item.isConnected && item.getAttribute('role') === 'checkbox' && item.getAttribute('tabindex') === null) {
      item.setAttribute('tabindex', tabIndex);
    }
  }, 0);
}
