import {
  Cell,
  addComposerChild$,
  addExportVisitor$,
  addImportVisitor$,
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
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListItemNode,
} from '@lexical/list';
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
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  TextNode,
  type LexicalEditor,
} from 'lexical';
import type { Parent, Text } from 'mdast';
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Handle, Options as ToMarkdownExtension } from 'mdast-util-to-markdown';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { searchEmoji } from '../lib/emojiCompletion';
import { getNoteSuggestions, getNoteTitle } from '../lib/noteSearch';
import type { VaultNode } from '../types/vault';

type WikiLinkMdastNode = Parent & {
  type: 'wikiLink';
  target: string;
  alias: string | null;
  children: Text[];
};

declare module 'mdast' {
  interface PhrasingContentMap {
    wikiLink: WikiLinkMdastNode;
  }

  interface RootContentMap {
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
      [addImportVisitor$]: MdastWikiLinkVisitor,
      [addExportVisitor$]: LexicalWikiLinkVisitor,
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

const wikiLinkFromMarkdownExtension: FromMarkdownExtension = {
  transforms: [(tree) => {
    transformWikiLinkText(tree);
    return tree;
  }],
};

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

class CompletionOption<T> extends MenuOption {
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
    </>
  );
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
      new CompletionOption(entry.emoji, entry, `${entry.emoji} :${entry.name}:`)
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
        const emoji = $createTextNode(option.item.emoji);
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

function removeFollowingClosingText(queryNode: TextNode, closing: string) {
  const nextSibling = queryNode.getNextSibling();
  if (!(nextSibling instanceof TextNode)) return;
  const value = nextSibling.getTextContent();
  if (!value.startsWith(closing)) return;
  const remainder = value.slice(closing.length);
  if (remainder) nextSibling.setTextContent(remainder);
  else nextSibling.remove();
}

function renderCompletionMenu<T>(
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
          <span>{option.label}</span>
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
  const sourceList = item.getParent();
  if (!$isListNode(sourceList)) return;
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

  const checklist = $createListNode('check');
  sourceList.insertBefore(checklist);
  checklist.append(item);
  item.setChecked(false);

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
