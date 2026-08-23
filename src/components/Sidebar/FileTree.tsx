import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { FolderInput } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { FileTreeItem } from './FileTreeItem';
import { VaultNode } from '../../types/vault';
import {
  FileTreeDndProvider,
  getVaultDragNodeId,
  getVaultDropData,
  ROOT_DROP_TARGET,
  useFileTreeDnd,
} from './FileTreeDndContext';

export function FileTree({ nodes }: { nodes: VaultNode[] }) {
  return (
    <FileTreeDndProvider>
      <RootDropTarget />
      <FileTreeList nodes={nodes} />
    </FileTreeDndProvider>
  );
}

export function FileTreeList({ nodes }: { nodes: VaultNode[] }) {
  return (
    <ul className="file-tree">
      {nodes.map((node) => (
        <FileTreeItem key={node.id} node={node} />
      ))}
    </ul>
  );
}

function RootDropTarget() {
  const { activeNodeId, canMoveTo, dropTargetId } = useFileTreeDnd();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    return dropTargetForElements({
      element,
      getData: () => getVaultDropData(ROOT_DROP_TARGET),
      canDrop: ({ source }) => {
        const nodeId = getVaultDragNodeId(source.data);
        return Boolean(nodeId && canMoveTo(nodeId, null));
      },
    });
  }, [activeNodeId, canMoveTo]);

  if (!activeNodeId) return null;

  const isValid = canMoveTo(activeNodeId, null);
  return (
    <div
      ref={ref}
      className={`root-drop-target ${dropTargetId === ROOT_DROP_TARGET ? 'active' : ''} ${isValid ? '' : 'invalid'}`}
      aria-hidden="true"
    >
      <FolderInput size={16} />
      <span>{isValid ? 'Move to vault root' : 'Already in vault root'}</span>
    </div>
  );
}
