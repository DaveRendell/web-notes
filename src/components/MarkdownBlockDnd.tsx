import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import {
  createContext,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  canMoveMarkdownBlock,
  getMarkdownBlockActions,
  getMarkdownBlockMenuMove,
  isMarkdownBlockDescendant,
  type MarkdownBlockDocument,
  type MarkdownBlockMove,
  type MarkdownBlockPlacement,
} from '../lib/markdownBlocks';
import { AnimatedPopover } from './AnimatedPopover';

const MARKDOWN_BLOCK_DRAG_TYPE = 'markdown-view-block';
const MARKDOWN_BLOCK_DROP_TYPE = 'markdown-view-block-destination';

type DropState = { blockId: string; placement: MarkdownBlockPlacement } | null;

type MarkdownBlockDndValue = {
  activeBlockId: string | null;
  disabled: boolean;
  document: MarkdownBlockDocument;
  dropState: DropState;
  onDelete: (blockId: string) => void;
  onMove: (move: MarkdownBlockMove) => void;
};

const MarkdownBlockDndContext = createContext<MarkdownBlockDndValue | null>(null);

export function MarkdownBlockDndProvider({
  children,
  disabled,
  document,
  onDelete,
  onMove,
  scrollElementRef,
}: {
  children: ReactNode;
  disabled: boolean;
  document: MarkdownBlockDocument;
  onDelete: (blockId: string) => void;
  onMove: (move: MarkdownBlockMove) => void;
  scrollElementRef: RefObject<HTMLElement | null>;
}) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [dropState, setDropState] = useState<DropState>(null);

  useEffect(
    () => monitorForElements({
      canMonitor: ({ source }) => getMarkdownBlockDragId(source.data) !== null,
      onDragStart: ({ source }) => setActiveBlockId(getMarkdownBlockDragId(source.data)),
      onDrag: ({ location }) => setDropState(getMarkdownBlockDrop(location.current.dropTargets[0]?.data)),
      onDropTargetChange: ({ location }) => setDropState(getMarkdownBlockDrop(location.current.dropTargets[0]?.data)),
      onDrop: ({ source, location }) => {
        const sourceId = getMarkdownBlockDragId(source.data);
        const destination = getMarkdownBlockDrop(location.current.dropTargets[0]?.data);
        setActiveBlockId(null);
        setDropState(null);
        if (sourceId && destination) onMove({ sourceId, targetId: destination.blockId, placement: destination.placement });
      },
    }),
    [onMove],
  );

  useEffect(() => {
    const element = scrollElementRef.current;
    if (!element) return;
    return autoScrollForElements({
      element,
      canScroll: ({ source }) => getMarkdownBlockDragId(source.data) !== null,
      getAllowedAxis: () => 'vertical',
    });
  }, [scrollElementRef]);

  const value = useMemo(
    () => ({ activeBlockId, disabled, document, dropState, onDelete, onMove }),
    [activeBlockId, disabled, document, dropState, onDelete, onMove],
  );

  return (
    <MarkdownBlockDndContext.Provider value={value}>
      {children}
      <MarkdownOutdentTarget />
    </MarkdownBlockDndContext.Provider>
  );
}

export function MarkdownBlockShell({ blockId, children }: { blockId: string | null; children: ReactNode }) {
  if (!blockId) return children;
  return <MarkdownBlockFrame blockId={blockId}>{children}</MarkdownBlockFrame>;
}

export function MarkdownBlockListItem({
  blockId,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLLIElement> & { blockId: string | null }) {
  if (!blockId) return <li {...props} className={className}>{children}</li>;
  return (
    <MarkdownBlockFrame blockId={blockId} asListItem className={className} {...props}>
      {children}
    </MarkdownBlockFrame>
  );
}

function MarkdownBlockFrame({
  asListItem = false,
  blockId,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & { asListItem?: boolean; blockId: string }) {
  const context = useMarkdownBlockDnd();
  const elementRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const block = context.document.blocks.find((candidate) => candidate.id === blockId);
  const actions = getMarkdownBlockActions(context.document, blockId);
  const isDragging = context.activeBlockId === blockId;
  const dropPlacement = context.dropState?.blockId === blockId ? context.dropState.placement : null;

  useEffect(() => {
    const element = elementRef.current;
    const dragHandle = handleRef.current;
    if (!element || !dragHandle || !block) return;

    const cleanupDraggable = draggable({
      element,
      dragHandle,
      canDrag: () => !context.disabled,
      getInitialData: () => ({ type: MARKDOWN_BLOCK_DRAG_TYPE, blockId }),
    });
    const cleanupDropTarget = dropTargetForElements({
      element,
      canDrop: ({ source }) => {
        const sourceId = getMarkdownBlockDragId(source.data);
        if (!sourceId || sourceId === blockId) return false;
        return !isMarkdownBlockDescendant(context.document, blockId, sourceId);
      },
      getData: ({ input, source }) => {
        const sourceId = getMarkdownBlockDragId(source.data);
        const placement = getPointerPlacement(element, input.clientY, Boolean(block.isListItem));
        const move = sourceId ? { sourceId, targetId: blockId, placement } satisfies MarkdownBlockMove : null;
        const isValid = Boolean(move && canMoveMarkdownBlock(context.document, move));
        return isValid
          ? { type: MARKDOWN_BLOCK_DROP_TYPE, blockId, placement }
          : { type: 'invalid-markdown-view-block-destination' };
      },
    });

    return () => {
      cleanupDraggable();
      cleanupDropTarget();
    };
  }, [block, blockId, context.disabled, context.document]);

  useEffect(() => {
    if (!isMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  });

  function closeMenu() {
    setIsMenuOpen(false);
    window.setTimeout(() => handleRef.current?.focus(), 0);
  }

  function runMenuMove(action: 'up' | 'down' | 'indent' | 'outdent') {
    const move = getMarkdownBlockMenuMove(context.document, blockId, action);
    closeMenu();
    if (move) context.onMove(move);
  }

  function deleteBlock() {
    if (!window.confirm('Delete this block?')) return;
    closeMenu();
    context.onDelete(blockId);
  }

  const controls = (
    <div className="markdown-block-controls" ref={menuRef}>
      <button
        ref={handleRef}
        className="markdown-block-handle"
        type="button"
        disabled={context.disabled}
        aria-label="Move block"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        onClick={() => setIsMenuOpen((open) => !open)}
        title={context.disabled ? 'Block movement is unavailable while this note is read-only' : 'Drag or choose how to move block'}
      >
        <GripVertical size={16} />
      </button>
      <AnimatedPopover className="markdown-block-menu" isOpen={isMenuOpen} onEscape={closeMenu} placementGap={2} role="menu">
        <BlockMenuButton icon={<ArrowUp size={15} />} label="Move up" disabled={!actions.canMoveUp} onClick={() => runMenuMove('up')} />
        <BlockMenuButton icon={<ArrowDown size={15} />} label="Move down" disabled={!actions.canMoveDown} onClick={() => runMenuMove('down')} />
        <BlockMenuButton icon={<ArrowRight size={15} />} label="Indent" disabled={!actions.canIndent} onClick={() => runMenuMove('indent')} />
        <BlockMenuButton icon={<ArrowLeft size={15} />} label="Outdent" disabled={!actions.canOutdent} onClick={() => runMenuMove('outdent')} />
        <BlockMenuButton className="danger" icon={<Trash2 size={15} />} label="Delete block" disabled={context.disabled} onClick={deleteBlock} />
      </AnimatedPopover>
    </div>
  );

  const frameClass = `markdown-block${isDragging ? ' dragging' : ''}${dropPlacement ? ` drop-${dropPlacement}` : ''}${className ? ` ${className}` : ''}`;
  if (asListItem) {
    return <li {...props as HTMLAttributes<HTMLLIElement>} data-markdown-block-source-start={block?.startOffset} ref={elementRef as RefObject<HTMLLIElement>} className={frameClass}>{controls}{children}</li>;
  }
  return <div {...props as HTMLAttributes<HTMLDivElement>} data-markdown-block-source-start={block?.startOffset} ref={elementRef as RefObject<HTMLDivElement>} className={frameClass}>{controls}{children}</div>;
}

function MarkdownOutdentTarget() {
  const context = useMarkdownBlockDnd();
  const ref = useRef<HTMLDivElement>(null);
  const active = context.activeBlockId
    ? context.document.blocks.find((block) => block.id === context.activeBlockId)
    : null;
  const isVisible = Boolean(active?.parentId);

  useEffect(() => {
    const element = ref.current;
    if (!element || !isVisible || !active) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => getMarkdownBlockDragId(source.data) === active.id,
      getData: () => ({ type: MARKDOWN_BLOCK_DROP_TYPE, blockId: active.id, placement: 'outdent' }),
    });
  }, [active, isVisible]);

  if (!isVisible || !active) return null;
  return (
    <div
      ref={ref}
      className={`markdown-outdent-target${context.dropState?.placement === 'outdent' ? ' active' : ''}`}
    >
      <ArrowLeft size={16} />
      Outdent
    </div>
  );
}

function BlockMenuButton({
  className,
  disabled,
  icon,
  label,
  onClick,
}: {
  className?: string;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return <button className={className} type="button" role="menuitem" disabled={disabled} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function getPointerPlacement(element: HTMLElement, clientY: number, canNest: boolean): MarkdownBlockPlacement {
  const rect = element.getBoundingClientRect();
  const ratio = rect.height ? (clientY - rect.top) / rect.height : 0;
  if (canNest && ratio >= 0.3 && ratio <= 0.7) return 'nest';
  return ratio < 0.5 ? 'before' : 'after';
}

function getMarkdownBlockDragId(data: Record<string | symbol, unknown>) {
  return data.type === MARKDOWN_BLOCK_DRAG_TYPE && typeof data.blockId === 'string' ? data.blockId : null;
}

function getMarkdownBlockDrop(data: Record<string | symbol, unknown> | undefined): DropState {
  if (
    data?.type !== MARKDOWN_BLOCK_DROP_TYPE
    || typeof data.blockId !== 'string'
    || !['before', 'after', 'nest', 'outdent'].includes(String(data.placement))
  ) return null;
  return { blockId: data.blockId, placement: data.placement as MarkdownBlockPlacement };
}

function useMarkdownBlockDnd() {
  const context = useContext(MarkdownBlockDndContext);
  if (!context) throw new Error('Markdown blocks must be rendered inside MarkdownBlockDndProvider.');
  return context;
}
