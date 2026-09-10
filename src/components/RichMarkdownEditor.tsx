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
import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { refreshContentEditableSpellcheck } from '../lib/contentEditableSpellcheck';
import type { VaultNode } from '../types/vault';
import { richEditorEnhancementsPlugin } from './richEditorEnhancements';
import { richBlockDragPlugin } from './richBlockDrag';
import { richBlockBackgroundPlugin } from './richBlockBackground';
import { richEditorIcon } from './richEditorIcons';
import { RichInsertImageButton } from './RichInsertImageButton';

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
  onSave: () => void;
  readOnly?: boolean;
  recentNotes: VaultNode[];
  spellCheck: boolean;
};

export default function RichMarkdownEditor({ markdown, blockMovementDisabled = false, notes, onActiveChange, onActivity, onBlur, onChange, onError, onInitialNormalize, onSave, readOnly = false, recentNotes, spellCheck }: RichMarkdownEditorProps) {
  const { theme } = useTheme();
  const editorRef = useRef<MDXEditorMethods>(null);
  const shellRef = useRef<HTMLDivElement>(null);
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

  return (
    <div
      ref={shellRef}
      className="rich-markdown-editor-shell"
      onBlurCapture={(event) => {
        if (refreshingSpellcheckRef.current) return;
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        onActiveChange(false);
        onBlur?.();
      }}
      onFocusCapture={() => {
        if (!refreshingSpellcheckRef.current) onActiveChange(true);
      }}
      onPointerDownCapture={onActivity}
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
