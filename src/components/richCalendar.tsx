import { addExportVisitor$, addImportVisitor$, addLexicalNode$, addToMarkdownExtension$, realmPlugin, type LexicalExportVisitor, type MdastImportVisitor } from '@mdxeditor/editor';
import type { Handle, Options as ToMarkdownExtension } from 'mdast-util-to-markdown';
import { calendarWidgetComment, type CalendarWidgetMdastNode } from '../lib/calendarWidget';
import { $createRichCalendarNode, $isRichCalendarNode, RichCalendarNode } from './RichCalendarNode';

const importer: MdastImportVisitor<CalendarWidgetMdastNode> = {
  testNode: 'calendarWidget',
  visitNode({ actions, mdastNode }) { actions.addAndStepInto($createRichCalendarNode(mdastNode.config)); },
};

const exporter: LexicalExportVisitor<RichCalendarNode, CalendarWidgetMdastNode> = {
  testLexicalNode: $isRichCalendarNode,
  visitLexicalNode({ actions, lexicalNode }) {
    actions.addAndStepInto('calendarWidget', { config: lexicalNode.getConfig() });
  },
};

const handler: Handle = (node: CalendarWidgetMdastNode) => calendarWidgetComment(node.config);
const toMarkdown: ToMarkdownExtension = { handlers: { calendarWidget: handler } };

export const richCalendarPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: RichCalendarNode,
      [addImportVisitor$]: importer,
      [addExportVisitor$]: exporter,
      [addToMarkdownExtension$]: toMarkdown,
    });
  },
});
