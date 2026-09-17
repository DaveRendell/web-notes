import { DecoratorNode, $applyNodeReplacement, type LexicalNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical';
import type { ReactNode } from 'react';
import { Twemoji } from './Twemoji';

export type SerializedRichEmojiNode = Spread<{
  emoji: string;
  format: number;
  style: string;
}, SerializedLexicalNode>;

export class RichEmojiNode extends DecoratorNode<ReactNode> {
  __emoji: string;
  __format: number;
  __style: string;

  static getType() {
    return 'web-notes-emoji';
  }

  static clone(node: RichEmojiNode) {
    return new RichEmojiNode(node.__emoji, node.__format, node.__style, node.__key);
  }

  static importJSON(node: SerializedRichEmojiNode) {
    return $createRichEmojiNode(node.emoji, node.format, node.style);
  }

  constructor(emoji: string, format = 0, style = '', key?: NodeKey) {
    super(key);
    this.__emoji = emoji;
    this.__format = format;
    this.__style = style;
  }

  createDOM() {
    const span = document.createElement('span');
    span.className = 'rich-emoji-node';
    return span;
  }

  updateDOM() {
    return false;
  }

  decorate() {
    return <Twemoji emoji={this.__emoji} />;
  }

  exportJSON(): SerializedRichEmojiNode {
    return {
      ...super.exportJSON(),
      emoji: this.__emoji,
      format: this.__format,
      style: this.__style,
      type: RichEmojiNode.getType(),
      version: 1,
    };
  }

  getEmoji() {
    return this.__emoji;
  }

  getFormat() {
    return this.__format;
  }

  getStyle() {
    return this.__style;
  }

  getTextContent() {
    return this.__emoji;
  }

  isInline(): true {
    return true;
  }
}

export function $createRichEmojiNode(emoji: string, format = 0, style = '') {
  return $applyNodeReplacement(new RichEmojiNode(emoji, format, style));
}

export function $isRichEmojiNode(node: LexicalNode | null | undefined): node is RichEmojiNode {
  return node instanceof RichEmojiNode;
}
