import { DriveFile, GOOGLE_FOLDER_MIME_TYPE } from '../types/drive';
import { VaultNode, VaultNodeType } from '../types/vault';

export function createVaultNode(file: DriveFile, parentPath: string): VaultNode {
  const type = getVaultNodeType(file);
  const path = parentPath ? `${parentPath}/${file.name}` : file.name;

  return {
    id: file.id,
    name: file.name,
    path,
    mimeType: file.mimeType,
    type,
    children: type === 'folder' ? [] : undefined,
    source: file,
  };
}

export function sortVaultNodes(nodes: VaultNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    if (a.type === 'markdown' && b.type === 'other') return -1;
    if (a.type === 'other' && b.type === 'markdown') return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function getVaultNodeDisplayName(node: VaultNode) {
  return node.type === 'markdown' ? node.name.replace(/\.md$/i, '') : node.name;
}

export function findVaultNode(nodes: VaultNode[], nodeId: string): VaultNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children) {
      const match = findVaultNode(node.children, nodeId);
      if (match) return match;
    }
  }

  return null;
}

export function findVaultNodeParentId(
  nodes: VaultNode[],
  nodeId: string,
  parentId: string | null = null,
): string | null {
  for (const node of nodes) {
    if (node.id === nodeId) return parentId;
    if (node.children) {
      const match = findVaultNodeParentId(node.children, nodeId, node.id);
      if (match !== null) return match;
    }
  }

  return null;
}

export function containsVaultNode(node: VaultNode, nodeId: string): boolean {
  return Boolean(node.children?.some((child) => child.id === nodeId || containsVaultNode(child, nodeId)));
}

export function flattenVaultNodes(nodes: VaultNode[]): VaultNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenVaultNodes(node.children) : [])]);
}

function getVaultNodeType(file: DriveFile): VaultNodeType {
  if (file.mimeType === GOOGLE_FOLDER_MIME_TYPE) {
    return 'folder';
  }

  if (file.name.toLowerCase().endsWith('.md')) {
    return 'markdown';
  }

  return 'other';
}
