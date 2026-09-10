import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { $createListNode, $isListItemNode, $isListNode, type ListItemNode, type ListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { addComposerChild$, Cell, realmPlugin, useCellValue } from '@mdxeditor/editor';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import {
  $getNodeByKey,
  $getState,
  $setState,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  $isRootNode,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatedPopover } from './AnimatedPopover';
import { BLOCK_BACKGROUNDS } from '../lib/blockBackground';
import { blockBackgroundState } from './richBlockBackground';

const RICH_BLOCK_DRAG_TYPE = 'web-notes-rich-block';
const GUTTER_TARGET_OVERSCAN = 36;
const disabled$ = Cell(false);

type Placement = 'before' | 'after' | 'nest' | 'outdent';
type Candidate = { element: HTMLElement; key: NodeKey; listItem: boolean; taskItem: boolean };
type DropState = { key: NodeKey; placement: Placement } | null;

export const richBlockDragPlugin = realmPlugin<{ disabled: boolean }>({
  init(realm, params) {
    realm.pubIn({
      [addComposerChild$]: RichBlockDrag,
      [disabled$]: params?.disabled ?? false,
    });
  },
  update(realm, params) {
    realm.pub(disabled$, params?.disabled ?? false);
  },
});

function RichBlockDrag() {
  const [editor] = useLexicalComposerContext();
  const disabled = useCellValue(disabled$);
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null);
  const [revision, setRevision] = useState(0);
  const [hoveredKey, setHoveredKey] = useState<NodeKey | null>(null);
  const [dropState, setDropState] = useState<DropState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const handleRef = useRef<HTMLButtonElement>(null);
  const handleContainerRef = useRef<HTMLDivElement>(null);
  const outdentTargetRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => editor.registerRootListener((nextRoot) => {
    setRootElement(nextRoot);
    setRevision((value) => value + 1);
  }), [editor]);

  useEffect(() => editor.registerUpdateListener(() => {
    window.requestAnimationFrame(() => setRevision((value) => value + 1));
  }), [editor]);

  const candidates = useMemo(
    () => {
      void revision;
      return rootElement ? getCandidates(editor) : [];
    },
    [editor, revision, rootElement],
  );
  const hovered = candidates.find((candidate) => candidate.key === hoveredKey) ?? null;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!rootElement) return;
    const editorShell = rootElement.closest('.rich-markdown-editor-shell');
    if (!(editorShell instanceof HTMLElement)) return;

    function handlePointerMove(event: PointerEvent) {
      if (isDragging || isMenuOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest('.rich-block-controls')) {
        clearHideTimer();
        return;
      }
      const candidate = findCandidateForTarget(candidates, target)
        ?? findCandidateInGutter(candidates, event.clientX, event.clientY);
      if (!candidate) {
        scheduleHide();
        return;
      }
      clearHideTimer();
      setHoveredKey(candidate.key);
    }

    function scheduleHide() {
      if (isDragging || isMenuOpen) return;
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => setHoveredKey(null), 80);
    }

    editorShell.addEventListener('pointermove', handlePointerMove);
    editorShell.addEventListener('pointerleave', scheduleHide);
    return () => {
      editorShell.removeEventListener('pointermove', handlePointerMove);
      editorShell.removeEventListener('pointerleave', scheduleHide);
      clearHideTimer();
    };
  }, [candidates, clearHideTimer, isDragging, isMenuOpen, rootElement]);

  useLayoutEffect(() => {
    const container = handleContainerRef.current;
    if (!container || !hovered) return;
    const targetContainer = container;
    const targetCandidate = hovered;
    const targetElement = targetCandidate.element;

    function positionHandle() {
      const rect = getCandidateInteractionRect(targetCandidate);
      const gutterOffset = getGutterOffset(targetCandidate);
      const firstLineHeight = getFirstLineHeight(targetElement, rect.height);
      const taskOffset = targetCandidate.taskItem ? 4 : 0;
      const top = rect.top + Math.max(0, (firstLineHeight - 28) / 2) - taskOffset;
      targetContainer.style.transform = `translate(${Math.max(4, rect.left - gutterOffset)}px, ${top}px)`;
    }

    positionHandle();
    window.addEventListener('resize', positionHandle);
    window.addEventListener('scroll', positionHandle, true);
    return () => {
      window.removeEventListener('resize', positionHandle);
      window.removeEventListener('scroll', positionHandle, true);
    };
  }, [hovered]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!hovered || !handle || disabled) return;
    return draggable({
      element: handle,
      dragHandle: handle,
      getInitialData: () => ({ type: RICH_BLOCK_DRAG_TYPE, key: hovered.key }),
      onDragStart: () => {
        setIsDragging(true);
        setIsMenuOpen(false);
      },
      onDrop: () => setIsDragging(false),
    });
  }, [disabled, hovered]);

  useEffect(() => {
    const cleanups = candidates.map((candidate) => dropTargetForElements({
      element: candidate.element,
      canDrop: ({ source }) => canDropOnCandidate(editor, candidate, source.data),
      getData: ({ input, source }) => getCandidateDropData(editor, candidate, source.data, input.clientY),
    }));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [candidates, editor]);

  useEffect(() => monitorForElements({
    canMonitor: ({ source }) => getDragKey(source.data) !== null,
    onDrag: ({ location }) => setDropState(getDropState(location.current.dropTargets[0]?.data)),
    onDropTargetChange: ({ location }) => setDropState(getDropState(location.current.dropTargets[0]?.data)),
    onDrop: ({ source, location }) => {
      const sourceKey = getDragKey(source.data);
      const destination = getDropState(location.current.dropTargets[0]?.data);
      setDropState(null);
      setIsDragging(false);
      if (sourceKey && destination) moveBlock(editor, sourceKey, destination.key, destination.placement);
    },
  }), [editor]);

  useEffect(() => {
    const element = outdentTargetRef.current;
    if (!element || !isDragging || !hoveredKey) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => getDragKey(source.data) === hoveredKey,
      getData: () => ({ type: RICH_BLOCK_DRAG_TYPE, key: hoveredKey, placement: 'outdent' }),
    });
  }, [hoveredKey, isDragging]);

  useEffect(() => {
    if (!rootElement) return;
    const scrollElement = findScrollElement(rootElement);
    if (!scrollElement) return;
    return autoScrollForElements({
      element: scrollElement,
      canScroll: ({ source }) => getDragKey(source.data) !== null,
      getAllowedAxis: () => 'vertical',
    });
  }, [rootElement]);

  useEffect(() => {
    for (const candidate of candidates) {
      candidate.element.classList.toggle('rich-block-dragging', isDragging && candidate.key === hoveredKey);
      const placement = dropState?.key === candidate.key ? dropState.placement : null;
      candidate.element.classList.toggle('rich-block-drop-before', placement === 'before');
      candidate.element.classList.toggle('rich-block-drop-after', placement === 'after');
      candidate.element.classList.toggle('rich-block-drop-nest', placement === 'nest');
    }
    return () => candidates.forEach(({ element }) => element.classList.remove(
      'rich-block-dragging',
      'rich-block-drop-before',
      'rich-block-drop-after',
      'rich-block-drop-nest',
    ));
  }, [candidates, dropState, hoveredKey, isDragging]);

  const actions = hoveredKey ? getActions(editor, hoveredKey) : EMPTY_ACTIONS;
  const portalHost = rootElement?.closest('.rich-markdown-editor-shell');
  if (!hovered || !portalHost || !rootElement) return null;

  function runAction(action: 'up' | 'down' | 'indent' | 'outdent' | 'delete') {
    if (!hoveredKey) return;
    setIsMenuOpen(false);
    runMenuAction(editor, hoveredKey, action);
    window.requestAnimationFrame(() => handleRef.current?.focus());
  }

  return createPortal(
    <>
      <div
        className="rich-block-controls"
        ref={handleContainerRef}
        onMouseEnter={clearHideTimer}
        onMouseLeave={() => {
          if (!isMenuOpen && !isDragging) setHoveredKey(null);
        }}
      >
        <button
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          aria-label="Move block"
          className="rich-block-handle"
          disabled={disabled}
          onClick={() => setIsMenuOpen((open) => !open)}
          ref={handleRef}
          title={disabled ? 'Block movement is unavailable while this note is read-only' : 'Drag or choose how to move block'}
          type="button"
        >
          <GripVertical size={16} />
        </button>
        <AnimatedPopover className="markdown-block-menu rich-block-menu" isOpen={isMenuOpen} placementGap={2} role="menu">
          <MenuButton disabled={!actions.up} icon={<ArrowUp size={15} />} label="Move up" onClick={() => runAction('up')} />
          <MenuButton disabled={!actions.down} icon={<ArrowDown size={15} />} label="Move down" onClick={() => runAction('down')} />
          <MenuButton disabled={!actions.indent} icon={<ArrowRight size={15} />} label="Indent" onClick={() => runAction('indent')} />
          <MenuButton disabled={!actions.outdent} icon={<ArrowLeft size={15} />} label="Outdent" onClick={() => runAction('outdent')} />
          <MenuButton className="danger" disabled={disabled} icon={<Trash2 size={15} />} label="Delete block" onClick={() => runAction('delete')} />
          <div className="block-background-label">Background colour</div>
          <div className="block-background-options">
            {[null, ...BLOCK_BACKGROUNDS].map((color) => (
              <button
                key={color ?? 'default'}
                type="button"
                role="menuitemradio"
                aria-label={color ? `${color} background` : 'Default background'}
                aria-checked={editor.getEditorState().read(() => {
                  const node = $getNodeByKey(hovered.key);
                  return Boolean(node && $getState(node, blockBackgroundState) === color);
                })}
                title={color ?? 'Default'}
                data-block-background={color ?? undefined}
                disabled={disabled}
                onClick={() => {
                  editor.update(() => {
                    const node = $getNodeByKey(hovered.key);
                    if (node) $setState(node, blockBackgroundState, color);
                  });
                  setIsMenuOpen(false);
                  window.requestAnimationFrame(() => handleRef.current?.focus());
                }}
              >{color ? '' : '×'}</button>
            ))}
          </div>
        </AnimatedPopover>
      </div>
      {isDragging && actions.outdent && (
        <div
          className={`rich-block-outdent-target${dropState?.placement === 'outdent' ? ' active' : ''}`}
          ref={outdentTargetRef}
        >
          <ArrowLeft size={16} />
          Outdent
        </div>
      )}
      {isDragging && <RichBlockGutterRail candidates={candidates} editor={editor} rootElement={rootElement} />}
    </>,
    portalHost,
  );
}

function RichBlockGutterRail({ candidates, editor, rootElement }: {
  candidates: Candidate[];
  editor: LexicalEditor;
  rootElement: HTMLElement;
}) {
  const elementRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || candidates.length === 0) return;

    function positionTarget() {
      const rootRect = rootElement.getBoundingClientRect();
      const handleBounds = candidates.map((candidate) => {
        const rect = getCandidateInteractionRect(candidate);
        const left = rect.left - getGutterOffset(candidate);
        return { left, right: left + 28 };
      });
      const left = Math.max(0, Math.min(...handleBounds.map((bounds) => bounds.left)) - GUTTER_TARGET_OVERSCAN);
      const right = Math.max(...handleBounds.map((bounds) => bounds.right)) + GUTTER_TARGET_OVERSCAN;
      element!.style.left = `${left}px`;
      element!.style.top = `${rootRect.top}px`;
      element!.style.width = `${right - left}px`;
      element!.style.height = `${Math.max(18, rootRect.height)}px`;
    }

    positionTarget();
    window.addEventListener('resize', positionTarget);
    window.addEventListener('scroll', positionTarget, true);
    return () => {
      window.removeEventListener('resize', positionTarget);
      window.removeEventListener('scroll', positionTarget, true);
    };
  }, [candidates, rootElement]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => {
        const sourceKey = getDragKey(source.data);
        return Boolean(sourceKey && candidates.some((candidate) => canMove(editor, sourceKey, candidate.key)));
      },
      getData: ({ input, source }) => {
        const candidate = findCandidateAtY(candidates, input.clientY);
        return candidate
          ? getCandidateDropData(editor, candidate, source.data, input.clientY, false)
          : { type: 'invalid-rich-block-target' };
      },
    });
  }, [candidates, editor]);

  return <div aria-hidden="true" className="rich-block-gutter-target rich-block-gutter-rail" ref={elementRef} />;
}

const EMPTY_ACTIONS = { up: false, down: false, indent: false, outdent: false };

function getCandidates(editor: LexicalEditor): Candidate[] {
  return editor.getEditorState().read(() => {
    const result: Candidate[] = [];
    const addListItems = (node: LexicalNode) => {
      if ($isListItemNode(node) && !isListWrapper(node)) {
        const element = editor.getElementByKey(node.getKey());
        if (element) result.push({
          element,
          key: node.getKey(),
          listItem: true,
          taskItem: node.getChecked() !== undefined,
        });
      }
      if ($isElementNode(node)) node.getChildren().forEach(addListItems);
    };

    for (const node of $getRoot().getChildren()) {
      if ($isListNode(node)) {
        node.getChildren().forEach(addListItems);
      } else {
        if ($isParagraphNode(node) && node.getTextContentSize() === 0) continue;
        const element = editor.getElementByKey(node.getKey());
        if (element) result.push({ element, key: node.getKey(), listItem: false, taskItem: false });
      }
    }
    return result;
  });
}

function isListWrapper(node: LexicalNode | null) {
  if (!$isListItemNode(node)) return false;
  return node.getChildrenSize() === 1 && $isListNode(node.getFirstChild());
}

function getVisibleListItems(node: LexicalNode) {
  return $isElementNode(node)
    ? node.getChildren().filter((child): child is ListItemNode => $isListItemNode(child) && !isListWrapper(child))
    : [];
}

function findCandidateForTarget(candidates: Candidate[], target: Node) {
  const element = target instanceof Element ? target : target.parentElement;
  if (!element) return null;
  const listItem = element.closest('li');
  if (listItem) {
    const match = candidates.find((candidate) => candidate.element === listItem);
    if (match) return match;
  }
  return candidates.find((candidate) => candidate.element === element || candidate.element.contains(element)) ?? null;
}

function findCandidateInGutter(candidates: Candidate[], pointerX: number, pointerY: number) {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const rect = getCandidateInteractionRect(candidate);
    const gutterOffset = getGutterOffset(candidate);
    if (pointerX >= rect.left - gutterOffset - GUTTER_TARGET_OVERSCAN
      && pointerX <= rect.left + GUTTER_TARGET_OVERSCAN
      && pointerY >= rect.top
      && pointerY <= rect.bottom) return candidate;
  }
  return null;
}

function findCandidateAtY(candidates: Candidate[], pointerY: number) {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const rect = getCandidateInteractionRect(candidate);
    if (pointerY >= rect.top && pointerY <= rect.bottom) return candidate;
  }
  return candidates.reduce<{ candidate: Candidate | null; distance: number }>((closest, candidate) => {
    const rect = getCandidateInteractionRect(candidate);
    const distance = pointerY < rect.top ? rect.top - pointerY : pointerY - rect.bottom;
    return distance < closest.distance ? { candidate, distance } : closest;
  }, { candidate: null, distance: Number.POSITIVE_INFINITY }).candidate;
}

function getPlacement(candidate: Candidate, pointerY: number, allowNesting = true): Placement {
  const rect = getCandidateInteractionRect(candidate);
  const ratio = rect.height ? (pointerY - rect.top) / rect.height : 0;
  if (allowNesting && candidate.listItem && ratio >= 0.42 && ratio <= 0.58) return 'nest';
  return ratio < 0.5 ? 'before' : 'after';
}

function getCandidateInteractionRect(candidate: Candidate) {
  const rect = candidate.element.getBoundingClientRect();
  if (!candidate.listItem) return rect;
  const childList = Array.from(candidate.element.children).find((child) => child.matches('ul, ol'));
  if (!childList) return rect;
  const childRect = childList.getBoundingClientRect();
  const bottom = Math.max(rect.top, Math.min(rect.bottom, childRect.top));
  return {
    ...rect,
    bottom,
    height: bottom - rect.top,
  };
}

function getGutterOffset(candidate: Candidate) {
  if (!candidate.listItem) return 30;
  if (!candidate.taskItem) return 70;
  const style = getComputedStyle(candidate.element);
  const taskMargin = Number.parseFloat(style.marginInlineStart || style.marginLeft);
  return Math.max(30, 70 + (Number.isFinite(taskMargin) ? Math.min(0, taskMargin) : -16));
}

function getFirstLineHeight(element: HTMLElement, blockHeight: number) {
  const style = getComputedStyle(element);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const fontSize = Number.parseFloat(style.fontSize);
  const resolvedLineHeight = Number.isFinite(lineHeight)
    ? lineHeight
    : (Number.isFinite(fontSize) ? fontSize * 1.2 : 28);
  return Math.min(blockHeight, resolvedLineHeight);
}

function canDropOnCandidate(editor: LexicalEditor, candidate: Candidate, data: Record<string, unknown>) {
  const sourceKey = getDragKey(data);
  return Boolean(sourceKey && sourceKey !== candidate.key && canMove(editor, sourceKey, candidate.key));
}

function getCandidateDropData(
  editor: LexicalEditor,
  candidate: Candidate,
  data: Record<string, unknown>,
  pointerY: number,
  allowNesting = true,
) {
  const sourceKey = getDragKey(data);
  const placement = getPlacement(candidate, pointerY, allowNesting);
  return sourceKey && canMove(editor, sourceKey, candidate.key, placement)
    ? { type: RICH_BLOCK_DRAG_TYPE, key: candidate.key, placement }
    : { type: 'invalid-rich-block-target' };
}

function getDragKey(data: Record<string, unknown>): NodeKey | null {
  return data.type === RICH_BLOCK_DRAG_TYPE && typeof data.key === 'string' ? data.key : null;
}

function getDropState(data: Record<string, unknown> | undefined): DropState {
  if (!data || data.type !== RICH_BLOCK_DRAG_TYPE || typeof data.key !== 'string') return null;
  const placement = data.placement;
  return placement === 'before' || placement === 'after' || placement === 'nest' || placement === 'outdent'
    ? { key: data.key, placement }
    : null;
}

function canMove(editor: LexicalEditor, sourceKey: NodeKey, targetKey: NodeKey, placement?: Placement) {
  return editor.getEditorState().read(() => {
    const source = $getNodeByKey(sourceKey);
    const target = $getNodeByKey(targetKey);
    if (!source || !target || source.is(target) || isAncestor(source, target)) return false;
    if (placement === 'nest') return $isListItemNode(source) && $isListItemNode(target);
    return true;
  });
}

function isAncestor(possibleParent: LexicalNode, node: LexicalNode) {
  let parent = node.getParent();
  while (parent) {
    if (parent.is(possibleParent)) return true;
    parent = parent.getParent();
  }
  return false;
}

function moveBlock(editor: LexicalEditor, sourceKey: NodeKey, targetKey: NodeKey, placement: Placement) {
  editor.update(() => {
    const source = $getNodeByKey(sourceKey);
    if (placement === 'outdent') {
      if (!$isListItemNode(source)) return;
      source.selectStart();
      editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
      return;
    }
    const target = $getNodeByKey(targetKey);
    if (!source || !target || source.is(target) || isAncestor(source, target)) return;

    if (placement === 'nest') {
      if (!$isListItemNode(source) || !$isListItemNode(target)) return;
      moveListItemWithSubtree(source, target, 'after');
      source.selectStart();
      editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
      return;
    }

    const destination = !$isListItemNode(source) && $isListItemNode(target)
      ? getTopLevelList(target)
      : target;
    if (!destination) return;
    if ($isListItemNode(source) && $isListItemNode(destination)) {
      const sourceList = source.getParent();
      const destinationList = destination.getParent();
      if (
        $isListNode(sourceList)
        && $isListNode(destinationList)
        && sourceList.getListType() !== destinationList.getListType()
      ) {
        moveListItemToNewList(source, sourceList, destination, destinationList, placement);
      } else {
        moveListItemWithSubtree(source, destination, placement);
      }
    } else if (placement === 'before') destination.insertBefore(source);
    else destination.insertAfter(source);
  }, { tag: 'rich-block-move' });
}

function moveListItemToNewList(
  source: ListItemNode,
  sourceList: ListNode,
  target: ListItemNode,
  destinationList: ListNode,
  placement: 'before' | 'after',
) {
  const nestedWrapper = source.getNextSibling();
  const sourceType = sourceList.getListType();
  const fragment = $createListNode(sourceType, sourceList.getStart());
  source.setChecked(sourceType === 'check' ? source.getChecked() ?? false : undefined);
  fragment.append(source);
  if (nestedWrapper && isListWrapper(nestedWrapper)) fragment.append(nestedWrapper);

  if (placement === 'before') {
    const previous = target.getPreviousSibling();
    if (previous) previous.insertAfter(fragment);
    else destinationList.insertBefore(fragment);
    return;
  }

  const nestedTarget = target.getNextSibling();
  const anchor = nestedTarget && isListWrapper(nestedTarget) ? nestedTarget : target;
  anchor.insertAfter(fragment);
}

function moveListItemWithSubtree(source: ListItemNode, target: ListItemNode, placement: 'before' | 'after') {
  const nestedWrapper = source.getNextSibling();
  if (placement === 'before') target.insertBefore(source);
  else target.insertAfter(source);
  if (nestedWrapper && isListWrapper(nestedWrapper)) source.insertAfter(nestedWrapper);
}

function getTopLevelList(node: ListItemNode): LexicalNode | null {
  let current: LexicalNode | null = node;
  while (current && !$isRootNode(current.getParent())) current = current.getParent();
  return current;
}

function getActions(editor: LexicalEditor, key: NodeKey) {
  return editor.getEditorState().read(() => {
    const node = $getNodeByKey(key);
    if (!node) return EMPTY_ACTIONS;
    if ($isListItemNode(node)) {
      const siblings = node.getParent() ? getVisibleListItems(node.getParent()!) : [];
      const index = siblings.findIndex((sibling) => sibling.is(node));
      const parentList = node.getParent();
      const parentItem = parentList?.getParent();
      return {
        up: index > 0,
        down: index >= 0 && index < siblings.length - 1,
        indent: index > 0 && !isListWrapper(siblings[index - 1]),
        outdent: $isListNode(parentList) && $isListItemNode(parentItem),
      };
    }
    const siblings = $getRoot().getChildren();
    const index = siblings.findIndex((sibling) => sibling.is(node));
    return { up: index > 0, down: index >= 0 && index < siblings.length - 1, indent: false, outdent: false };
  });
}

function runMenuAction(editor: LexicalEditor, key: NodeKey, action: 'up' | 'down' | 'indent' | 'outdent' | 'delete') {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (!node) return;
    if (action === 'delete') {
      const nestedWrapper = $isListItemNode(node) ? node.getNextSibling() : null;
      if (nestedWrapper && isListWrapper(nestedWrapper)) nestedWrapper.remove();
      node.remove();
      return;
    }
    if (action === 'indent' && $isListItemNode(node)) {
      node.selectStart();
      editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
      return;
    }
    if (action === 'outdent' && $isListItemNode(node)) {
      node.selectStart();
      editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
      return;
    }

    const siblings = $isListItemNode(node)
      ? node.getParent() ? getVisibleListItems(node.getParent()!) : []
      : $getRoot().getChildren();
    const index = siblings.findIndex((sibling) => sibling.is(node));
    const target = action === 'up' ? siblings[index - 1] : siblings[index + 1];
    if (!target) return;
    if ($isListItemNode(node) && $isListItemNode(target)) moveListItemWithSubtree(node, target, action === 'up' ? 'before' : 'after');
    else if (action === 'up') target.insertBefore(node);
    else target.insertAfter(node);
  }, { tag: 'rich-block-menu' });
}

function findScrollElement(root: HTMLElement) {
  let current: HTMLElement | null = root;
  while (current) {
    if (current.scrollHeight > current.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(current).overflowY)) return current;
    current = current.parentElement;
  }
  return null;
}

function MenuButton({ className = '', disabled, icon, label, onClick }: {
  className?: string;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={className} disabled={disabled} onClick={onClick} role="menuitem" type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}
