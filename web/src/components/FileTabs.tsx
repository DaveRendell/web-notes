import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { FileText, Image, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { getVaultNodeDisplayName } from '../lib/vaultTree';
import type { VaultNode } from '../types/vault';
import { Twemoji } from './Twemoji';

const FILE_TAB_DRAG_TYPE = 'web-notes-file-tab';
const FILE_TAB_DROP_TYPE = 'web-notes-file-tab-destination';
type DropState = { fileId: string; placement: 'before' | 'after' } | null;

export function FileTabs() {
  const { activateFileTab, closeFileTab, noteIcons, openFiles, reorderFileTab, selectedFile } = useVault();
  const stripRef = useRef<HTMLDivElement>(null);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dropState, setDropState] = useState<DropState>(null);

  useEffect(() => monitorForElements({
    canMonitor: ({ source }) => getFileTabDragId(source.data) !== null,
    onDragStart: ({ source }) => setDraggedFileId(getFileTabDragId(source.data)),
    onDrag: ({ location }) => setDropState(getFileTabDrop(location.current.dropTargets[0]?.data)),
    onDropTargetChange: ({ location }) => setDropState(getFileTabDrop(location.current.dropTargets[0]?.data)),
    onDrop: ({ source, location }) => {
      const fileId = getFileTabDragId(source.data);
      const destination = getFileTabDrop(location.current.dropTargets[0]?.data);
      setDraggedFileId(null);
      setDropState(null);
      if (fileId && destination) reorderFileTab(fileId, destination.fileId, destination.placement);
    },
  }), [reorderFileTab]);

  useEffect(() => {
    const element = stripRef.current;
    if (!element) return;
    return autoScrollForElements({
      element,
      canScroll: ({ source }) => getFileTabDragId(source.data) !== null,
      getAllowedAxis: () => 'horizontal',
    });
  }, [openFiles.length]);

  if (openFiles.length < 2) return null;

  return (
    <div className="file-tabs" role="tablist" aria-label="Open files" ref={stripRef}>
      {openFiles.map((file) => (
        <FileTab
          active={file.id === selectedFile?.id}
          closeFileTab={closeFileTab}
          dropPlacement={dropState?.fileId === file.id ? dropState.placement : null}
          dragged={draggedFileId === file.id}
          emoji={file.type === 'markdown' ? noteIcons[file.id] : null}
          file={file}
          key={file.id}
          selectFileTab={activateFileTab}
        />
      ))}
    </div>
  );
}

function FileTab({ active, closeFileTab, dragged, dropPlacement, emoji, file, selectFileTab }: {
  active: boolean;
  closeFileTab: (fileId: string) => void;
  dragged: boolean;
  dropPlacement: 'before' | 'after' | null;
  emoji: string | null | undefined;
  file: VaultNode;
  selectFileTab: (fileId: string) => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLButtonElement>(null);
  const label = getVaultNodeDisplayName(file);

  useEffect(() => {
    const element = elementRef.current;
    const dragHandle = dragHandleRef.current;
    if (!element || !dragHandle) return;
    const cleanupDraggable = draggable({
      element,
      dragHandle,
      getInitialData: () => getFileTabDragData(file.id),
    });
    const cleanupDropTarget = dropTargetForElements({
      element,
      canDrop: ({ source }) => getFileTabDragId(source.data) !== file.id,
      getData: ({ input }) => getFileTabDropData(
        file.id,
        input.clientX < element.getBoundingClientRect().left + element.offsetWidth / 2 ? 'before' : 'after',
      ),
    });
    return () => {
      cleanupDraggable();
      cleanupDropTarget();
    };
  }, [file.id]);

  return (
    <div
      className={`file-tab${active ? ' active' : ''}${dragged ? ' dragging' : ''}${dropPlacement ? ` drop-${dropPlacement}` : ''}`}
      ref={elementRef}
    >
      <button
        className="file-tab-select"
        ref={dragHandleRef}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => selectFileTab(file.id)}
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          closeFileTab(file.id);
        }}
        title={`${file.path} · Drag to rearrange`}
      >
        {emoji ? <span className="note-emoji"><Twemoji emoji={emoji} hidden /></span>
          : file.type === 'image' ? <Image size={14} /> : <FileText size={14} />}
        <span>{label}</span>
      </button>
      <button
        className="file-tab-close"
        type="button"
        onClick={() => closeFileTab(file.id)}
        aria-label={`Close ${label}`}
        title={`Close ${label}`}
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function getFileTabDragData(fileId: string) {
  return { type: FILE_TAB_DRAG_TYPE, fileId };
}

export function getFileTabDropData(fileId: string, placement: 'before' | 'after') {
  return { type: FILE_TAB_DROP_TYPE, fileId, placement };
}

function getFileTabDragId(data: Record<string | symbol, unknown>) {
  return data.type === FILE_TAB_DRAG_TYPE && typeof data.fileId === 'string' ? data.fileId : null;
}

function getFileTabDrop(data: Record<string | symbol, unknown> | undefined): DropState {
  if (
    data?.type !== FILE_TAB_DROP_TYPE
    || typeof data.fileId !== 'string'
    || (data.placement !== 'before' && data.placement !== 'after')
  ) return null;
  return { fileId: data.fileId, placement: data.placement };
}
