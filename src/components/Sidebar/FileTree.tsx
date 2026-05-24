import { FileTreeItem } from './FileTreeItem';
import { VaultNode } from '../../types/vault';

export function FileTree({ nodes }: { nodes: VaultNode[] }) {
  return (
    <ul className="file-tree">
      {nodes.map((node) => (
        <FileTreeItem key={node.id} node={node} />
      ))}
    </ul>
  );
}
