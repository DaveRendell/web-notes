import type { Nodes, Parent, Root } from 'mdast';
declare module 'unist' {
  interface Data { blockBackground?: BlockBackground }
}

export const BLOCK_BACKGROUNDS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const;
export type BlockBackground = typeof BLOCK_BACKGROUNDS[number];
export function parseBlockBackground(value: unknown): BlockBackground | null {
  return BLOCK_BACKGROUNDS.includes(value as BlockBackground) ? value as BlockBackground : null;
}
export function backgroundComment(color: BlockBackground) {
  return `<!-- web-notes:background=${color} -->`;
}
export function readBackgroundComment(value: string) {
  return parseBlockBackground(value.trim().match(/^<!-- web-notes:background=([a-z]+) -->$/)?.[1]);
}

// Consume only our exact annotations. Unknown HTML remains subject to the normal
// compatibility guard, rather than being silently discarded by the editor.
export function extractBlockBackgrounds(tree: Root) {
  function walk(parent: Parent) {
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i];
      const color = node.type === 'html' ? readBackgroundComment(node.value) : null;
      if (color) {
        const target = parent.type === 'paragraph' ? parent : parent.children[i + 1];
        if (target && target.type !== 'html') {
          target.data = { ...target.data, blockBackground: color };
          parent.children.splice(i--, 1);
          const previous = parent.children[i];
          if (parent.type === 'paragraph' && previous?.type === 'text') previous.value = previous.value.replace(/ +$/, '');
        }
      } else if ('children' in node) walk(node as Parent);
    }
  }
  walk(tree);
  return tree;
}
export function nodeBackground(node: Nodes) {
  return parseBlockBackground(node.data?.blockBackground);
}
