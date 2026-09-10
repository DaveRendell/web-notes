import {
  Cell,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  addComposerChild$,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addNestedEditorChild$,
  addTableCellEditorChild$,
  addToMarkdownExtension$,
  createRootEditorSubscription$,
  realmPlugin,
  useCellValue,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from '@mdxeditor/editor';
import { $createLinkNode, $isLinkNode, type LinkNode } from '@lexical/link';
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $createListNode,
  $createListItemNode,
  $isListItemNode,
  $isListNode,
  type ListItemNode,
  type ListNode,
} from '@lexical/list';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  type MenuRenderFn,
  type MenuTextMatch,
  type TriggerFn,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $createParagraphNode,
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  TextNode,
  type LexicalEditor,
} from 'lexical';
import type { Image, List, Parent, RootContent, Text } from 'mdast';
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Handle, Options as ToMarkdownExtension } from 'mdast-util-to-markdown';
import type { Literal } from 'unist';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { searchEmoji } from '../lib/emojiCompletion';
import type { BlockBackground } from '../lib/blockBackground';
import { splitEmojiText } from '../lib/twemoji';
import { getNoteSuggestions, getNoteTitle } from '../lib/noteSearch';
import {
  getSlashCommandSuggestions,
  rememberSlashCommand,
  requestImageDialog,
  type SlashCommand,
} from '../lib/slashCommands';
import { blockBackgroundState } from './richBlockBackground';
import { $setState } from 'lexical';
import type { VaultNode } from '../types/vault';
import { $createRichEmojiNode, $isRichEmojiNode, RichEmojiNode } from './RichEmojiNode';
import { $createRichImageNode, $isRichImageNode, RichImageNode } from './RichImageNode';
import { Twemoji, TwemojiText } from './Twemoji';

type WikiLinkMdastNode = Parent & {
  type: 'wikiLink';
  target: string;
  alias: string | null;
  children: Text[];
};

type EmojiMdastNode = Omit<Literal, 'data'> & {
  type: 'emoji';
  value: string;
  data?: Text['data'];
};

declare module 'mdast' {
  interface PhrasingContentMap {
    emoji: EmojiMdastNode;
    wikiLink: WikiLinkMdastNode;
  }

  interface RootContentMap {
    emoji: EmojiMdastNode;
    wikiLink: WikiLinkMdastNode;
  }
}

type RichEditorEnhancementsParams = {
  notes: VaultNode[];
  recentNotes: VaultNode[];
};

const notes$ = Cell<VaultNode[]>([]);
const recentNotes$ = Cell<VaultNode[]>([]);
const WIKILINK_URL_PREFIX = 'web-notes-wikilink:';
const MAX_RESULTS = 8;

export const richEditorEnhancementsPlugin = realmPlugin<RichEditorEnhancementsParams>({
  init(realm, params) {
    realm.pubIn({
      [notes$]: params?.notes ?? [],
      [recentNotes$]: params?.recentNotes ?? [],
      [addMdastExtension$]: wikiLinkFromMarkdownExtension,
      [addLexicalNode$]: [RichEmojiNode, RichImageNode],
      [addImportVisitor$]: [MdastWikiLinkVisitor, MdastEmojiVisitor, MdastImageVisitor, MdastNumberedListVisitor],
      [addExportVisitor$]: [LexicalWikiLinkVisitor, LexicalEmojiVisitor, LexicalImageVisitor, LexicalNumberedListVisitor],
      [addToMarkdownExtension$]: wikiLinkToMarkdownExtension,
      [addComposerChild$]: RichEditorCompletions,
      [addNestedEditorChild$]: RichEditorCompletions,
      [addTableCellEditorChild$]: RichEditorCompletions,
      [createRootEditorSubscription$]: (editor: LexicalEditor) => editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => handleChecklistShortcut(event, editor),
        COMMAND_PRIORITY_HIGH,
      ),
    });
  },
  update(realm, params) {
    realm.pubIn({
      [notes$]: params?.notes ?? [],
      [recentNotes$]: params?.recentNotes ?? [],
    });
  },
});

const MdastWikiLinkVisitor: MdastImportVisitor<WikiLinkMdastNode> = {
  testNode: 'wikiLink',
  visitNode({ actions, mdastNode }) {
    actions.addAndStepInto($createLinkNode(encodeWikiLinkUrl(mdastNode.target, mdastNode.alias)));
  },
};

// The stock list visitors omit the starting number on import and export.
const MdastNumberedListVisitor: MdastImportVisitor<List> = {
  priority: 100,
  testNode: (node) => node.type === 'list' && Boolean(node.ordered)
    && !node.children.some((item) => typeof item.checked === 'boolean'),
  visitNode({ mdastNode, lexicalParent, actions }) {
    const list = $createListNode('number', mdastNode.start ?? 1);
    if ($isListItemNode(lexicalParent)) {
      const wrapper = $createListItemNode();
      wrapper.append(list);
      lexicalParent.insertAfter(wrapper);
    } else if ($isElementNode(lexicalParent)) {
      lexicalParent.append(list);
    }
    actions.visitChildren(mdastNode, list);
  },
};

const LexicalNumberedListVisitor: LexicalExportVisitor<ListNode, List> = {
  priority: 100,
  testLexicalNode: (node): node is ListNode => $isListNode(node) && node.getListType() === 'number',
  visitLexicalNode({ lexicalNode, actions }) {
    actions.addAndStepInto('list', { ordered: true, start: lexicalNode.getStart(), spread: false });
  },
};

const MdastEmojiVisitor: MdastImportVisitor<EmojiMdastNode> = {
  testNode: 'emoji',
  visitNode({ actions, mdastNode }) {
    actions.addAndStepInto($createRichEmojiNode(
      mdastNode.value,
      actions.getParentFormatting(),
      actions.getParentStyle(),
    ));
  },
};

const MdastImageVisitor: MdastImportVisitor<Image> = {
  testNode: 'image',
  visitNode({ actions, mdastNode }) {
    actions.addAndStepInto($createRichImageNode(mdastNode.url, mdastNode.alt ?? '', mdastNode.title ?? null));
  },
};

const LexicalWikiLinkVisitor: LexicalExportVisitor<LinkNode, WikiLinkMdastNode> = {
  priority: 100,
  testLexicalNode: (node): node is LinkNode => $isLinkNode(node) && node.getURL().startsWith(WIKILINK_URL_PREFIX),
  visitLexicalNode({ actions, lexicalNode }) {
    const parsed = decodeWikiLinkUrl(lexicalNode.getURL());
    if (!parsed) {
      actions.nextVisitor();
      return;
    }

    const visibleLabel = lexicalNode.getTextContent();
    const defaultLabel = getWikiLinkDefaultLabel(parsed.target);
    actions.addAndStepInto('wikiLink', {
      alias: parsed.alias ?? (visibleLabel !== defaultLabel ? visibleLabel : null),
      target: parsed.target,
    });
  },
};

const LexicalEmojiVisitor: LexicalExportVisitor<RichEmojiNode, RootContent> = {
  shouldJoin(previous, current) {
    return previous.type === current.type && ['text', 'emphasis', 'strong', 'delete'].includes(current.type);
  },
  join<T extends RootContent>(previous: T, current: T): T {
    if (previous.type === 'text' && current.type === 'text') {
      return { type: 'text', value: previous.value + current.value } as T;
    }
    if ('children' in previous && 'children' in current) {
      return { ...previous, children: [...previous.children, ...current.children] } as T;
    }
    return current;
  },
  testLexicalNode: $isRichEmojiNode,
  visitLexicalNode({ actions, lexicalNode, mdastParent }) {
    const format = lexicalNode.getFormat();
    let parent = mdastParent;
    if (format & IS_ITALIC) parent = actions.appendToParent(parent, { type: 'emphasis', children: [] }) as Parent;
    if (format & IS_BOLD) parent = actions.appendToParent(parent, { type: 'strong', children: [] }) as Parent;
    if (format & IS_STRIKETHROUGH) parent = actions.appendToParent(parent, { type: 'delete', children: [] }) as Parent;
    actions.appendToParent(parent, format & IS_CODE
      ? { type: 'inlineCode', value: lexicalNode.getEmoji() }
      : { type: 'text', value: lexicalNode.getEmoji() });
  },
};

const LexicalImageVisitor: LexicalExportVisitor<RichImageNode, Image> = {
  testLexicalNode: $isRichImageNode,
  visitLexicalNode({ actions, lexicalNode, mdastParent }) {
    actions.appendToParent(mdastParent, {
      type: 'image',
      url: lexicalNode.getSource(),
      alt: lexicalNode.getAltText(),
      title: lexicalNode.getTitle(),
    });
  },
};

const wikiLinkFromMarkdownExtension: FromMarkdownExtension = {
  transforms: [(tree) => {
    transformWikiLinkText(tree);
    transformEmojiText(tree);
    return tree;
  }],
};

function transformEmojiText(parent: Parent) {
  for (let index = 0; index < parent.children.length; index += 1) {
    const node = parent.children[index];
    if (node.type === 'text') {
      const parts = splitEmojiText(node.value);
      if (parts.some((part) => part.emoji)) {
        const replacements = parts.map((part): Text | EmojiMdastNode => ({
          type: part.emoji ? 'emoji' : 'text',
          value: part.text,
        }));
        parent.children.splice(index, 1, ...replacements);
        index += replacements.length - 1;
      }
      continue;
    }
    if ('children' in node && Array.isArray(node.children)) transformEmojiText(node);
  }
}

const wikiLinkHandler: Handle = (node: WikiLinkMdastNode) => {
  const alias = node.alias?.trim();
  return `[[${node.target}${alias ? `|${alias}` : ''}]]`;
};

const wikiLinkToMarkdownExtension: ToMarkdownExtension = {
  handlers: { wikiLink: wikiLinkHandler },
};

function transformWikiLinkText(parent: Parent, insideLink = false) {
  for (let index = 0; index < parent.children.length; index += 1) {
    const node = parent.children[index];
    if (node.type === 'text' && !insideLink) {
      const replacements = splitWikiLinkText(node);
      if (replacements) {
        parent.children.splice(index, 1, ...replacements);
        index += replacements.length - 1;
      }
      continue;
    }

    if ('children' in node && Array.isArray(node.children) && node.type !== 'wikiLink') {
      transformWikiLinkText(node, insideLink || node.type === 'link' || node.type === 'linkReference');
    }
  }
}

function splitWikiLinkText(node: Text) {
  const pattern = /\[\[([^\]\n]+)\]\]/g;
  const replacements: Array<Text | WikiLinkMdastNode> = [];
  let sourceIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(node.value))) {
    if (match.index > 0 && node.value[match.index - 1] === '!') continue;
    if (match.index > sourceIndex) replacements.push({ type: 'text', value: node.value.slice(sourceIndex, match.index) });

    const parsed = parseWikiLink(match[1]);
    replacements.push({
      type: 'wikiLink',
      target: parsed.target,
      alias: parsed.alias,
      children: [{ type: 'text', value: parsed.alias ?? getWikiLinkDefaultLabel(parsed.target) }],
    });
    sourceIndex = match.index + match[0].length;
  }

  if (!replacements.length) return null;
  if (sourceIndex < node.value.length) replacements.push({ type: 'text', value: node.value.slice(sourceIndex) });
  return replacements;
}

function parseWikiLink(value: string) {
  const pipeIndex = value.indexOf('|');
  const target = (pipeIndex === -1 ? value : value.slice(0, pipeIndex)).trim();
  const alias = pipeIndex === -1 ? null : value.slice(pipeIndex + 1).trim() || null;
  return { alias, target };
}

function getWikiLinkDefaultLabel(target: string) {
  const targetWithoutHeading = target.split('#', 1)[0];
  return targetWithoutHeading.slice(targetWithoutHeading.lastIndexOf('/') + 1) || targetWithoutHeading;
}

function encodeWikiLinkUrl(target: string, alias: string | null) {
  return `${WIKILINK_URL_PREFIX}${encodeURIComponent(target)}?alias=${alias === null ? '' : encodeURIComponent(alias)}`;
}

function decodeWikiLinkUrl(url: string) {
  if (!url.startsWith(WIKILINK_URL_PREFIX)) return null;
  const encoded = url.slice(WIKILINK_URL_PREFIX.length);
  const separator = encoded.indexOf('?alias=');
  const targetPart = separator === -1 ? encoded : encoded.slice(0, separator);
  const aliasPart = separator === -1 ? '' : encoded.slice(separator + 7);
  return {
    target: decodeURIComponent(targetPart),
    alias: aliasPart ? decodeURIComponent(aliasPart) : null,
  };
}

class CompletionOption<T extends object> extends MenuOption {
  constructor(
    key: string,
    readonly item: T,
    readonly label: string,
    readonly detail?: string,
  ) {
    super(key);
  }
}

function RichEditorCompletions() {
  return (
    <>
      <WikiLinkTextTransform />
      <WikiLinkTypeahead />
      <EmojiTypeahead />
      <SlashCommandTypeahead />
      <EmojiTextTransform />
    </>
  );
}

function SlashCommandTypeahead() {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [recentRevision, setRecentRevision] = useState(0);
  const options = useMemo(
    () => {
      void recentRevision;
      return query === null ? [] : getSlashCommandSuggestions(query).map((command) => (
        new CompletionOption(command.id, command, command.label, command.detail)
      ));
    },
    [query, recentRevision],
  );

  return (
    <LexicalTypeaheadMenuPlugin
      anchorClassName="rich-completion-anchor"
      menuRenderFn={renderCompletionMenu}
      onQueryChange={setQuery}
      onSelectOption={(option, queryNode, closeMenu) => {
        if (!queryNode) return;
        applyRichSlashCommand(editor, queryNode, option.item);
        rememberSlashCommand(option.item.id);
        setRecentRevision((value) => value + 1);
        closeMenu();
      }}
      options={options}
      parent={document.body}
      triggerFn={slashCommandTrigger}
    />
  );
}

function applyRichSlashCommand(editor: LexicalEditor, queryNode: TextNode, command: SlashCommand) {
  queryNode.setTextContent('');
  queryNode.selectStart();

  if (command.id === 'image') {
    window.requestAnimationFrame(() => requestImageDialog(editor.getRootElement()));
    return;
  }
  if (command.kind === 'background') {
    const listItem = $findMatchingParent(queryNode, $isListItemNode);
    const target = listItem ?? queryNode.getTopLevelElement();
    if (target) $setState(target, blockBackgroundState, command.id as BlockBackground);
    return;
  }

  const listCommands = {
    todo: 'check',
    bullet: 'bullet',
    numbered: 'number',
  } as const;
  if (command.id in listCommands) {
    const listItem = $findMatchingParent(queryNode, $isListItemNode);
    if (listItem) convertListItemType(listItem, listCommands[command.id as keyof typeof listCommands]);
    else {
      const insertCommands = {
        todo: INSERT_CHECK_LIST_COMMAND,
        bullet: INSERT_UNORDERED_LIST_COMMAND,
        numbered: INSERT_ORDERED_LIST_COMMAND,
      } as const;
      editor.dispatchCommand(insertCommands[command.id as keyof typeof insertCommands], undefined);
    }
    return;
  }

  if ($findMatchingParent(queryNode, $isListItemNode)) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  if (command.id === 'paragraph') $setBlocksType(selection, () => $createParagraphNode());
  else if (command.id === 'quote') $setBlocksType(selection, () => $createQuoteNode());
  else if (command.id === 'heading') $setBlocksType(selection, () => $createHeadingNode('h1'));
  else if (command.id === 'heading2') $setBlocksType(selection, () => $createHeadingNode('h2'));
  else if (command.id === 'heading3') $setBlocksType(selection, () => $createHeadingNode('h3'));
}

function WikiLinkTypeahead() {
  const notes = useCellValue(notes$);
  const recentNotes = useCellValue(recentNotes$);
  const [query, setQuery] = useState<string | null>(null);
  const options = useMemo(
    () => query === null ? [] : getNoteSuggestions(notes, recentNotes, query, MAX_RESULTS).map((note) => (
      new CompletionOption(note.id, note, getNoteTitle(note), note.path)
    )),
    [notes, query, recentNotes],
  );

  return (
    <LexicalTypeaheadMenuPlugin
      anchorClassName="rich-completion-anchor"
      menuRenderFn={renderCompletionMenu}
      onQueryChange={setQuery}
      onSelectOption={(option, queryNode, closeMenu) => {
        if (!queryNode) return;
        const target = option.item.path.replace(/\.md$/i, '');
        const link = $createLinkNode(encodeWikiLinkUrl(target, null));
        link.append($createTextNode(getNoteTitle(option.item)));
        removeFollowingClosingText(queryNode, ']]');
        queryNode.replace(link);
        link.selectEnd();
        closeMenu();
      }}
      options={options}
      parent={document.body}
      triggerFn={wikiLinkTrigger}
    />
  );
}

function EmojiTypeahead() {
  const [query, setQuery] = useState<string | null>(null);
  const options = useMemo(
    () => query === null ? [] : searchEmoji(query, MAX_RESULTS).map((entry) => (
      new CompletionOption(entry.emoji, entry, `:${entry.name}:`)
    )),
    [query],
  );

  return (
    <LexicalTypeaheadMenuPlugin
      anchorClassName="rich-completion-anchor"
      menuRenderFn={renderCompletionMenu}
      onQueryChange={setQuery}
      onSelectOption={(option, queryNode, closeMenu) => {
        if (!queryNode) return;
        const emoji = $createRichEmojiNode(option.item.emoji);
        removeFollowingClosingText(queryNode, ':');
        queryNode.replace(emoji);
        emoji.selectEnd();
        closeMenu();
      }}
      options={options}
      parent={document.body}
      triggerFn={emojiTrigger}
    />
  );
}

function WikiLinkTextTransform() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => editor.registerNodeTransform(TextNode, (node) => {
    if ($findMatchingParent(node, $isLinkNode)) return;
    const value = node.getTextContent();
    const match = /\[\[([^\]\n]+)\]\]/.exec(value);
    if (!match || (match.index > 0 && value[match.index - 1] === '!')) return;

    const parsed = parseWikiLink(match[1]);
    if (!parsed.target) return;
    const matchEnd = match.index + match[0].length;
    const matchNode = match.index === 0
      ? node.splitText(matchEnd)[0]
      : node.splitText(match.index, matchEnd)[1];
    const link = $createLinkNode(encodeWikiLinkUrl(parsed.target, parsed.alias));
    const label = $createTextNode(parsed.alias ?? getWikiLinkDefaultLabel(parsed.target));
    label.setFormat(matchNode.getFormat());
    label.setStyle(matchNode.getStyle());
    link.append(label);
    matchNode.replace(link);
  }), [editor]);

  return null;
}

function EmojiTextTransform() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => editor.registerNodeTransform(TextNode, (node) => {
    if (editor.isComposing() || node.hasFormat('code')) return;
    const parts = splitEmojiText(node.getTextContent());
    if (!parts.some((part) => part.emoji)) return;

    const replacements = parts.map((part) => part.emoji
      ? $createRichEmojiNode(part.text, node.getFormat(), node.getStyle())
      : $createTextNode(part.text).setFormat(node.getFormat()).setStyle(node.getStyle()));
    node.replace(replacements[0]);
    for (let index = 1; index < replacements.length; index += 1) replacements[index - 1].insertAfter(replacements[index]);
  }), [editor]);

  return null;
}

function removeFollowingClosingText(queryNode: TextNode, closing: string) {
  const nextSibling = queryNode.getNextSibling();
  if (!(nextSibling instanceof TextNode)) return;
  const value = nextSibling.getTextContent();
  if (!value.startsWith(closing)) return;
  const remainder = value.slice(closing.length);
  if (remainder) nextSibling.setTextContent(remainder);
  else nextSibling.remove();
}

function renderCompletionMenu<T extends object>(
  anchorRef: RefObject<HTMLElement | null>,
  props: Parameters<MenuRenderFn<CompletionOption<T>>>[1],
) {
  if (!anchorRef.current || props.options.length === 0) return null;
  return createPortal(
    <div className="rich-completion-menu">
      {props.options.map((option, index) => (
        <button
          aria-selected={props.selectedIndex === index}
          className={props.selectedIndex === index ? 'active' : ''}
          key={option.key}
          onClick={() => props.selectOptionAndCleanUp(option)}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => props.setHighlightedIndex(index)}
          ref={option.setRefElement}
          role="option"
          type="button"
        >
          <span>
            {'emoji' in option.item && typeof option.item.emoji === 'string' && <Twemoji emoji={option.item.emoji} hidden />}
            <TwemojiText text={option.label} />
          </span>
          {option.detail && <small>{option.detail}</small>}
        </button>
      ))}
    </div>,
    anchorRef.current,
  );
}

export const wikiLinkTrigger: TriggerFn = (text): MenuTextMatch | null => {
  const match = /\[\[([^\]\n|#]*)$/.exec(text);
  if (!match) return null;
  const leadOffset = match.index;
  if (leadOffset > 0 && text[leadOffset - 1] === '!') return null;
  return { leadOffset, matchingString: match[1], replaceableString: match[0] };
};

export const emojiTrigger: TriggerFn = (text): MenuTextMatch | null => {
  const match = /:([A-Za-z][A-Za-z0-9_+-]*)$/.exec(text);
  return match
    ? { leadOffset: match.index, matchingString: match[1], replaceableString: match[0] }
    : null;
};

export const slashCommandTrigger: TriggerFn = (text): MenuTextMatch | null => {
  const match = /(?:^|\s)(\/([A-Za-z0-9]*))$/.exec(text);
  return match
    ? { leadOffset: match.index + match[0].lastIndexOf('/'), matchingString: match[2], replaceableString: match[1] }
    : null;
};

function handleChecklistShortcut(event: KeyboardEvent, editor: LexicalEditor) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'l') return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  event.preventDefault();

  const listItem = $findMatchingParent(selection.anchor.getNode(), $isListItemNode);
  const list = listItem?.getParent();

  if ($isListItemNode(listItem) && $isListNode(list) && list.getListType() === 'check') {
    listItem.toggleChecked();
  } else if ($isListItemNode(listItem) && $isListNode(list)) {
    convertListItemToChecklist(listItem);
  } else {
    editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
  }
  return true;
}

function convertListItemToChecklist(item: ListItemNode) {
  convertListItemType(item, 'check');
}

function convertListItemType(item: ListItemNode, targetType: 'bullet' | 'check' | 'number') {
  const sourceList = item.getParent();
  if (!$isListNode(sourceList)) return;
  if (sourceList.getListType() === targetType) return;
  const children = sourceList.getChildren();
  const itemIndex = children.indexOf(item);
  if (itemIndex === -1) return;

  const beforeItems = children.slice(0, itemIndex);
  const afterItems = children.slice(itemIndex + 1);
  if (beforeItems.length) {
    const beforeList = $createListNode(sourceList.getListType(), sourceList.getStart());
    sourceList.insertBefore(beforeList);
    beforeList.append(...beforeItems);
  }

  const convertedList = $createListNode(targetType);
  sourceList.insertBefore(convertedList);
  convertedList.append(item);
  item.setChecked(targetType === 'check' ? false : undefined);

  if (afterItems.length) {
    const afterStart = sourceList.getListType() === 'number'
      ? sourceList.getStart() + itemIndex + 1
      : sourceList.getStart();
    const afterList = $createListNode(sourceList.getListType(), afterStart);
    sourceList.insertBefore(afterList);
    afterList.append(...afterItems);
  }

  sourceList.remove();
}
