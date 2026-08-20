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

function getVaultNodeType(file: DriveFile): VaultNodeType {
  if (file.mimeType === GOOGLE_FOLDER_MIME_TYPE) {
    return 'folder';
  }

  if (file.name.toLowerCase().endsWith('.md')) {
    return 'markdown';
  }

  return 'other';
}
