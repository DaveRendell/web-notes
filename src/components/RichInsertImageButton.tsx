import { activeEditor$, useCellValue } from '@mdxeditor/editor';
import { $getSelection, $isRangeSelection, $setSelection, $insertNodes, $getRoot, type RangeSelection } from 'lexical';
import { useEffect, useRef, type RefObject } from 'react';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { InsertImageButton } from './InsertImageButton';
import { $createRichImageNode } from './RichImageNode';

export function RichInsertImageButton({ disabled, pasteTarget }: { disabled: boolean; pasteTarget: RefObject<HTMLDivElement | null> }) {
  const editor = useCellValue(activeEditor$);
  const lastSelection = useRef<RangeSelection | null>(null);
  const bookmark = useRef<RangeSelection | null>(null);
  useEffect(() => {
    lastSelection.current = null;
    return editor?.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) lastSelection.current = selection.clone();
      });
    });
  }, [editor]);
  return <InsertImageButton disabled={disabled} pasteTarget={pasteTarget} onOpen={() => {
    editor?.getEditorState().read(() => {
      const selection = $getSelection();
      bookmark.current = $isRangeSelection(selection) ? selection.clone() : lastSelection.current?.clone() ?? null;
    });
  }} onInsert={(markdown) => {
    const paragraph = fromMarkdown(markdown).children[0];
    const image = paragraph?.type === 'paragraph' ? paragraph.children[0] : null;
    if (!editor || image?.type !== 'image') return;
    editor.update(() => {
      if (bookmark.current) $setSelection(bookmark.current.clone());
      else $getRoot().selectEnd();
      $insertNodes([$createRichImageNode(image.url, image.alt ?? '', image.title ?? null)]);
    }, { onUpdate: () => editor.focus() });
  }} />;
}
