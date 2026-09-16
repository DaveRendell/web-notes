import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { addComposerChild$, realmPlugin } from '@mdxeditor/editor';
import { useEffect, useState } from 'react';
import {
  canMove,
  findCandidateAtY,
  findCandidateForTarget,
  getCandidates,
  getPlacement,
  moveRichBlock,
  type Candidate,
  type Placement,
} from './richBlockDrag';

const LONG_PRESS_MS = 450;
const TAP_SLOP_PX = 10;
const NEST_INTENT_PX = 28;
const SCROLL_EDGE_PX = 52;
const SCROLL_STEP_PX = 10;

type Drop = { candidate: Candidate; placement: Placement } | null;

// Android feasibility adapter. It leaves ordinary touches alone until a deliberate
// long press succeeds, then uses the same Lexical movement operation as the web UI.
export const richBlockTouchDragPlugin = realmPlugin({
  init(realm) {
    realm.pub(addComposerChild$, RichBlockTouchDrag);
  },
});

function RichBlockTouchDrag() {
  const [editor] = useLexicalComposerContext();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => editor.registerRootListener((nextRoot) => setRoot(nextRoot)), [editor]);

  useEffect(() => {
    if (!root) return;
    let start: { x: number; y: number; key: string } | null = null;
    let pointer: { x: number; y: number } | null = null;
    let active = false;
    let pressTimer: number | null = null;
    let scrollFrame: number | null = null;
    let sourceElement: HTMLElement | null = null;
    let drop: Drop = null;

    function clearPressTimer() {
      if (pressTimer !== null) window.clearTimeout(pressTimer);
      pressTimer = null;
    }

    function showDrop(next: Drop) {
      if (drop?.candidate.element === next?.candidate.element && drop?.placement === next?.placement) return;
      if (drop) drop.candidate.element.classList.remove(`rich-touch-drop-${drop.placement}`);
      drop = next;
      if (drop) drop.candidate.element.classList.add(`rich-touch-drop-${drop.placement}`);
    }

    function updateDrop() {
      if (!active || !start || !pointer) return;
      const candidate = findCandidateAtY(getCandidates(editor), pointer.y);
      if (!candidate || candidate.key === start.key) {
        showDrop(null);
        return;
      }
      // Nesting requires a distinct rightward gesture. Vertical movement gets
      // the much larger before/after zones that are useful on a small screen.
      const placement = candidate.listItem && pointer.x - start.x >= NEST_INTENT_PX
        ? 'nest'
        : getPlacement(candidate, pointer.y, false);
      showDrop(canMove(editor, start.key, candidate.key, placement) ? { candidate, placement } : null);
    }

    function scrollWhileDragging() {
      if (!active || !pointer) return;
      const scrollElement = findScrollElement(root!);
      if (scrollElement) {
        const bounds = scrollElement.getBoundingClientRect();
        const previousScrollTop = scrollElement.scrollTop;
        if (pointer.y < bounds.top + SCROLL_EDGE_PX) scrollElement.scrollTop -= SCROLL_STEP_PX;
        else if (pointer.y > bounds.bottom - SCROLL_EDGE_PX) scrollElement.scrollTop += SCROLL_STEP_PX;
        if (scrollElement.scrollTop !== previousScrollTop) updateDrop();
      }
      scrollFrame = window.requestAnimationFrame(scrollWhileDragging);
    }

    function reset() {
      clearPressTimer();
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
      showDrop(null);
      sourceElement?.classList.remove('rich-touch-drag-source');
      sourceElement = null;
      root!.classList.remove('rich-touch-drag-pending');
      root!.classList.remove('rich-touch-drag-active');
      start = null;
      pointer = null;
      active = false;
      setDragging(false);
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) return;
      const element = target instanceof Element ? target : target.parentElement;
      if (element?.closest('a, button, input, textarea, select, [role="button"], [contenteditable="false"], .rich-image-placeholder')) return;
      const candidate = findCandidateForTarget(getCandidates(editor), target);
      if (!candidate) return;
      reset();
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, key: candidate.key };
      pointer = { x: touch.clientX, y: touch.clientY };
      sourceElement = candidate.element;
      // Android WebView starts native text selection on a held editable line.
      // Suppress that only while this touch could become a block drag.
      root!.classList.add('rich-touch-drag-pending');
      pressTimer = window.setTimeout(() => {
        if (!start) return;
        active = true;
        sourceElement?.classList.add('rich-touch-drag-source');
        root!.classList.add('rich-touch-drag-active');
        window.getSelection()?.removeAllRanges();
        setDragging(true);
        scrollFrame = window.requestAnimationFrame(scrollWhileDragging);
      }, LONG_PRESS_MS);
    }

    function onTouchMove(event: TouchEvent) {
      if (!start) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0];
      pointer = { x: touch.clientX, y: touch.clientY };
      if (!active) {
        if (Math.hypot(pointer.x - start.x, pointer.y - start.y) > TAP_SLOP_PX) reset();
        return;
      }
      event.preventDefault();
      updateDrop();
    }

    function onTouchEnd(event: TouchEvent) {
      if (!start) return;
      if (active) {
        event.preventDefault();
        updateDrop();
        const sourceKey = start.key;
        const destination = drop;
        reset();
        if (destination && canMove(editor, sourceKey, destination.candidate.key, destination.placement)) {
          moveRichBlock(editor, sourceKey, destination.candidate.key, destination.placement);
        }
      } else reset();
    }

    function onContextMenu(event: MouseEvent) {
      if (start) event.preventDefault();
    }

    function onSelectStart(event: Event) {
      if (start) event.preventDefault();
    }

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    root.addEventListener('touchend', onTouchEnd, { passive: false });
    root.addEventListener('touchcancel', reset);
    root.addEventListener('contextmenu', onContextMenu);
    root.addEventListener('selectstart', onSelectStart);
    return () => {
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('touchcancel', reset);
      root.removeEventListener('contextmenu', onContextMenu);
      root.removeEventListener('selectstart', onSelectStart);
      reset();
    };
  }, [editor, root]);

  return dragging ? <div aria-live="polite" className="rich-touch-drag-status">Drag to move · release to drop</div> : null;
}

function findScrollElement(root: HTMLElement) {
  let current: HTMLElement | null = root;
  while (current) {
    const style = getComputedStyle(current);
    if (current.scrollHeight > current.clientHeight && ['auto', 'scroll'].includes(style.overflowY)) return current;
    current = current.parentElement;
  }
  return null;
}
