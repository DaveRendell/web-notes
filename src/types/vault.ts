import { DriveFile } from './drive';

export type VaultNodeType = 'folder' | 'markdown' | 'image' | 'other';

export type VaultNode = {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  type: VaultNodeType;
  children?: VaultNode[];
  source: DriveFile;
};
