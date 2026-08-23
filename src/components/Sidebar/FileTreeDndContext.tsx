import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useVault } from '../../contexts/VaultContext';
import {
  containsVaultNode,
  findVaultNode,
  findVaultNodeParentId,
  flattenVaultNodes,
} from '../../lib/vaultTree';
import { MoveNodeDialog } from './MoveNodeDialog';

export const ROOT_DROP_TARGET = 'vault-root';
const VAULT_DRAG_TYPE = 'vault-node';
const VAULT_DROP_TYPE = 'vault-destination';

type FileTreeDndValue = {
  activeNodeId: string | null;
  canMoveTo: (nodeId: string, destinationId: string | null) => boolean;
  dropTargetId: string | null;
  expandedFolderIds: Set<string>;
  isMoving: (nodeId: string) => boolean;
  openMoveDialog: (nodeId: string, trigger: HTMLElement) => void;
  setFolderExpanded: (folderId: string, expanded: boolean) => void;
};

const FileTreeDndContext = createContext<FileTreeDndValue | null>(null);

export function FileTreeDndProvider({ children }: { children: ReactNode }) {
  const { isOnline, moveNode, tree } = useVault();
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
  const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const draggedFolderWasExpanded = useRef(false);

  const setFolderExpanded = useCallback((folderId: string, expanded: boolean) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(folderId);
      else next.delete(folderId);
      return next;
    });
  }, []);

  const canMoveTo = useCallback(
    (nodeId: string, destinationId: string | null) => {
      if (!isOnline || movingNodeId) return false;

      const node = findVaultNode(tree, nodeId);
      const destination = destinationId ? findVaultNode(tree, destinationId) : null;
      if (!node || (node.type !== 'folder' && node.type !== 'markdown')) return false;
      if (destinationId && destination?.type !== 'folder') return false;
      if (findVaultNodeParentId(tree, node.id) === destinationId) return false;
      if (node.id === destinationId) return false;
      return !(node.type === 'folder' && destination && containsVaultNode(node, destination.id));
    },
    [isOnline, movingNodeId, tree],
  );

  const finishDrag = useCallback(
    (nodeId: string) => {
      if (draggedFolderWasExpanded.current) {
        setFolderExpanded(nodeId, true);
      }
      draggedFolderWasExpanded.current = false;
      setActiveNodeId(null);
      setDropTargetId(null);
    },
    [setFolderExpanded],
  );

  const performMove = useCallback(
    async (nodeId: string, destinationId: string | null, expandMovedFolder: boolean) => {
      const node = findVaultNode(tree, nodeId);
      const destination = destinationId ? findVaultNode(tree, destinationId) : null;
      if (!node || (destinationId && !destination) || !canMoveTo(nodeId, destinationId)) return false;

      setMovingNodeId(nodeId);
      try {
        await moveNode(node, destination);
        if (destination) setFolderExpanded(destination.id, true);
        if (expandMovedFolder && node.type === 'folder') setFolderExpanded(node.id, true);
        return true;
      } catch (requestError) {
        window.alert(requestError instanceof Error ? requestError.message : 'Failed to move file.');
        return false;
      } finally {
        setMovingNodeId(null);
      }
    },
    [canMoveTo, moveNode, setFolderExpanded, tree],
  );

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => isVaultDragData(source.data),
        onDragStart: ({ source }) => {
          const nodeId = getDragNodeId(source.data);
          if (!nodeId) return;

          const node = findVaultNode(tree, nodeId);
          draggedFolderWasExpanded.current = Boolean(node?.type === 'folder' && expandedFolderIds.has(nodeId));
          if (node?.type === 'folder') setFolderExpanded(nodeId, false);
          setActiveNodeId(nodeId);
        },
        onDropTargetChange: ({ location }) => {
          setDropTargetId(getDropDestinationId(location.current.dropTargets[0]?.data));
        },
        onDrop: ({ source, location }) => {
          const nodeId = getDragNodeId(source.data);
          const destinationId = getDropDestinationId(location.current.dropTargets[0]?.data);
          if (!nodeId) return;

          const normalizedDestination = destinationId === ROOT_DROP_TARGET ? null : destinationId;
          const shouldMove = destinationId !== null && canMoveTo(nodeId, normalizedDestination);
          finishDrag(nodeId);
          if (shouldMove) void performMove(nodeId, normalizedDestination, true);
        },
      }),
    [canMoveTo, expandedFolderIds, finishDrag, performMove, setFolderExpanded, tree],
  );

  useEffect(() => {
    if (!activeNodeId || !dropTargetId || dropTargetId === ROOT_DROP_TARGET) return;

    const timer = window.setTimeout(() => setFolderExpanded(dropTargetId, true), 500);
    return () => window.clearTimeout(timer);
  }, [activeNodeId, dropTargetId, setFolderExpanded]);

  const openMoveDialog = useCallback((nodeId: string, trigger: HTMLElement) => {
    dialogTriggerRef.current = trigger;
    setDialogNodeId(nodeId);
  }, []);

  const closeMoveDialog = useCallback(() => {
    setDialogNodeId(null);
    window.setTimeout(() => dialogTriggerRef.current?.focus(), 0);
  }, []);

  const dialogNode = dialogNodeId ? findVaultNode(tree, dialogNodeId) : null;
  const dialogDestinations = useMemo(
    () =>
      dialogNode
        ? [null, ...flattenVaultNodes(tree).filter((node) => node.type === 'folder')].filter((destination) =>
            canMoveTo(dialogNode.id, destination?.id ?? null),
          )
        : [],
    [canMoveTo, dialogNode, tree],
  );

  const value = useMemo(
    () => ({
      activeNodeId,
      canMoveTo,
      dropTargetId,
      expandedFolderIds,
      isMoving: (nodeId: string) => movingNodeId === nodeId,
      openMoveDialog,
      setFolderExpanded,
    }),
    [activeNodeId, canMoveTo, dropTargetId, expandedFolderIds, movingNodeId, openMoveDialog, setFolderExpanded],
  );

  return (
    <FileTreeDndContext.Provider value={value}>
      {children}
      {dialogNode && (
        <MoveNodeDialog
          node={dialogNode}
          destinations={dialogDestinations}
          isMoving={movingNodeId === dialogNode.id}
          onCancel={closeMoveDialog}
          onMove={async (destination) => {
            const moved = await performMove(dialogNode.id, destination?.id ?? null, true);
            if (moved) closeMoveDialog();
          }}
        />
      )}
    </FileTreeDndContext.Provider>
  );
}

export function useFileTreeDnd() {
  const context = useContext(FileTreeDndContext);
  if (!context) throw new Error('useFileTreeDnd must be used inside FileTreeDndProvider.');
  return context;
}

export function getVaultDragData(nodeId: string) {
  return { type: VAULT_DRAG_TYPE, nodeId };
}

export function getVaultDropData(destinationId: string) {
  return { type: VAULT_DROP_TYPE, destinationId };
}

export function getVaultDragNodeId(data: Record<string | symbol, unknown>) {
  return getDragNodeId(data);
}

function isVaultDragData(data: Record<string | symbol, unknown>) {
  return data.type === VAULT_DRAG_TYPE && typeof data.nodeId === 'string';
}

function getDragNodeId(data: Record<string | symbol, unknown>) {
  return isVaultDragData(data) ? (data.nodeId as string) : null;
}

function getDropDestinationId(data: Record<string | symbol, unknown> | undefined) {
  return data?.type === VAULT_DROP_TYPE && typeof data.destinationId === 'string'
    ? (data.destinationId as string)
    : null;
}
