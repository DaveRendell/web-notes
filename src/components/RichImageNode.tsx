import { ImageOff } from 'lucide-react';
import { $applyNodeReplacement, DecoratorNode, type LexicalNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical';
import type { ReactNode } from 'react';

export type SerializedRichImageNode = Spread<{
  altText: string;
  source: string;
  title: string | null;
}, SerializedLexicalNode>;

export class RichImageNode extends DecoratorNode<ReactNode> {
  __altText: string;
  __source: string;
  __title: string | null;

  static getType() {
    return 'web-notes-image';
  }

  static clone(node: RichImageNode) {
    return new RichImageNode(node.__source, node.__altText, node.__title, node.__key);
  }

  static importJSON(node: SerializedRichImageNode) {
    return $createRichImageNode(node.source, node.altText, node.title);
  }

  constructor(source: string, altText: string, title: string | null, key?: NodeKey) {
    super(key);
    this.__altText = altText;
    this.__source = source;
    this.__title = title;
  }

  createDOM() {
    const span = document.createElement('span');
    span.className = 'rich-image-node';
    return span;
  }

  updateDOM() {
    return false;
  }

  decorate() {
    const label = getImageLabel(this.__source);
    return (
      <span
        aria-label={`${this.__altText || label}: image unavailable`}
        className="rich-image-placeholder"
        role="img"
        title={this.__title ?? this.__source}
      >
        <ImageOff aria-hidden="true" size={26} />
        <span>
          <strong>Image unavailable</strong>
          <small>{label}</small>
        </span>
      </span>
    );
  }

  exportJSON(): SerializedRichImageNode {
    return {
      ...super.exportJSON(),
      altText: this.__altText,
      source: this.__source,
      title: this.__title,
      type: RichImageNode.getType(),
      version: 1,
    };
  }

  getAltText() {
    return this.__altText;
  }

  getSource() {
    return this.__source;
  }

  getTitle() {
    return this.__title;
  }

  getTextContent() {
    return this.__altText || getImageLabel(this.__source);
  }

  isInline(): true {
    return true;
  }
}

export function $createRichImageNode(source: string, altText = '', title: string | null = null) {
  return $applyNodeReplacement(new RichImageNode(source, altText, title));
}

export function $isRichImageNode(node: LexicalNode | null | undefined): node is RichImageNode {
  return node instanceof RichImageNode;
}

function getImageLabel(source: string) {
  if (!source) return 'No image path';
  const path = source.split(/[?#]/, 1)[0];
  const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? source;
  try {
    return decodeURIComponent(name).slice(0, 64);
  } catch {
    return name.slice(0, 64);
  }
}
