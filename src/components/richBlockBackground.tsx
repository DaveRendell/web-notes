import { addComposerChild$, addExportVisitor$, addImportVisitor$, addMdastExtension$, realmPlugin, type LexicalExportVisitor, type MdastImportVisitor } from '@mdxeditor/editor';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isListItemNode, $isListNode } from '@lexical/list';
import { $getRoot, $getState, $setState, $isElementNode, createState, type LexicalNode } from 'lexical';
import { useEffect } from 'react';
import type { Nodes, Parent } from 'mdast';
import type { Extension } from 'mdast-util-from-markdown';
import { backgroundComment, extractBlockBackgrounds, nodeBackground, parseBlockBackground } from '../lib/blockBackground';

export const blockBackgroundState = createState('webNotesBackground', {
  parse: parseBlockBackground,
  // Enter creates the next list item by copying the current Lexical node.
  // A newly-created item should start with the default background.
  resetOnCopyNode: true,
});

// MDXEditor normally discards HTML comments during tokenization, before AST
// transforms run. Retain them here so our metadata can be attached to blocks.
const backgroundMarkdownExtension: Extension = {
  enter: { comment(token) { this.enter({ type: 'html', value: '' }, token); this.buffer(); } },
  exit: { comment(token) {
    this.resume();
    const node = this.stack[this.stack.length - 1];
    if (node.type === 'html') node.value = this.sliceSerialize(token);
    this.exit(token);
  } },
  transforms: [extractBlockBackgrounds],
};

const importer: MdastImportVisitor<Nodes> = {
  priority: 1000,
  testNode: (node) => Boolean(nodeBackground(node)),
  visitNode({ mdastNode, lexicalParent, actions }) {
    actions.nextVisitor();
    const target = mdastNode.type === 'paragraph' && $isListItemNode(lexicalParent)
      ? lexicalParent : $isElementNode(lexicalParent) ? lexicalParent.getLastChild() : null;
    if (target) $setState(target, blockBackgroundState, nodeBackground(mdastNode));
  },
};
const exporter: LexicalExportVisitor<LexicalNode, Nodes> = {
  priority: 1000,
  testLexicalNode: (node): node is LexicalNode => Boolean($getState(node, blockBackgroundState)),
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.nextVisitor();
    const color = $getState(lexicalNode, blockBackgroundState);
    if (!color || !mdastParent || !('children' in mdastParent)) return;
    const parent = mdastParent as Parent;
    const block = parent.children.at(-1);
    if (block?.type === 'listItem') {
      const paragraph = block.children[0];
      if (paragraph?.type === 'paragraph') {
        paragraph.children.push({ type: 'text', value: ' ' }, { type: 'html', value: backgroundComment(color) });
      }
    } else if (block) {
      parent.children.splice(parent.children.length - 1, 0, { type: 'html', value: backgroundComment(color) });
    }
  },
};

function BackgroundStyles() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const paint = () => editor.getEditorState().read(() => {
      function walk(node: LexicalNode) {
        const element = editor.getElementByKey(node.getKey());
        let color = $getState(node, blockBackgroundState);
        // Lexical represents nested lists in a separate structural list item.
        if (!color && $isListItemNode(node) && $isListNode(node.getFirstChild())) {
          const previous = node.getPreviousSibling();
          if (previous) color = $getState(previous, blockBackgroundState);
        }
        if (element) {
          if (color) element.dataset.blockBackground = color;
          else delete element.dataset.blockBackground;
        }
        if ($isElementNode(node)) node.getChildren().forEach(walk);
      }
      walk($getRoot());
    });
    paint();
    return editor.registerUpdateListener(paint);
  }, [editor]);
  return null;
}

export const richBlockBackgroundPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addMdastExtension$]: backgroundMarkdownExtension,
      [addImportVisitor$]: importer,
      [addExportVisitor$]: exporter,
      [addComposerChild$]: BackgroundStyles,
    });
  },
});
