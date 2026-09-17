import { $applyNodeReplacement, DecoratorNode, type LexicalNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical';
import type { ReactNode } from 'react';
import type { CalendarWidgetConfig } from '../lib/calendarWidget';
import { CalendarWidget } from './CalendarWidget';

export type SerializedRichCalendarNode = Spread<{ config: CalendarWidgetConfig }, SerializedLexicalNode>;

export class RichCalendarNode extends DecoratorNode<ReactNode> {
  __config: CalendarWidgetConfig;

  static getType() { return 'web-notes-calendar'; }
  static clone(node: RichCalendarNode) { return new RichCalendarNode(node.__config, node.__key); }
  static importJSON(node: SerializedRichCalendarNode) { return $createRichCalendarNode(node.config); }

  constructor(config: CalendarWidgetConfig, key?: NodeKey) {
    super(key);
    this.__config = config;
  }

  createDOM() {
    const div = document.createElement('div');
    div.className = 'rich-calendar-node';
    return div;
  }

  updateDOM(previous: RichCalendarNode) {
    return JSON.stringify(previous.__config) !== JSON.stringify(this.__config);
  }

  decorate() { return <CalendarWidget config={this.__config} nodeKey={this.__key} />; }
  exportJSON(): SerializedRichCalendarNode {
    return { ...super.exportJSON(), config: this.__config, type: RichCalendarNode.getType(), version: 1 };
  }
  getConfig() { return this.__config; }
  setConfig(config: CalendarWidgetConfig) {
    const writable = this.getWritable();
    writable.__config = config;
  }
  getTextContent() { return 'Google Calendar'; }
  isInline(): false { return false; }
}

export function $createRichCalendarNode(config: CalendarWidgetConfig) {
  return $applyNodeReplacement(new RichCalendarNode(config));
}

export function $isRichCalendarNode(node: LexicalNode | null | undefined): node is RichCalendarNode {
  return node instanceof RichCalendarNode;
}
