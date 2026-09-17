import { activeEditor$, useCellValue } from '@mdxeditor/editor';
import { $getRoot, $getSelection, $isRangeSelection, type LexicalNode } from 'lexical';
import { useRef, type RefObject } from 'react';
import { $createRichCalendarNode } from './RichCalendarNode';
import { InsertCalendarButton } from './InsertCalendarButton';

export function RichInsertCalendarButton({ disabled, pasteTarget }: { disabled: boolean; pasteTarget: RefObject<HTMLDivElement | null> }) {
  const editor = useCellValue(activeEditor$);
  const anchorKey = useRef<string | null>(null);
  return <InsertCalendarButton disabled={disabled} pasteTarget={pasteTarget} onOpen={() => {
    editor?.getEditorState().read(() => {
      const selection = $getSelection();
      anchorKey.current = $isRangeSelection(selection) ? selection.anchor.getNode().getTopLevelElement()?.getKey() ?? null : null;
    });
  }} onInsert={(config) => {
    if (!editor) return;
    editor.update(() => {
      const calendar = $createRichCalendarNode(config);
      const anchor = anchorKey.current ? findTopLevel(anchorKey.current) : null;
      if (anchor) anchor.insertAfter(calendar);
      else $getRoot().append(calendar);
      calendar.selectNext();
    }, { onUpdate: () => editor.focus() });
  }} />;
}

function findTopLevel(key: string): LexicalNode | null {
  return $getRoot().getChildren().find((node) => node.getKey() === key) ?? null;
}
