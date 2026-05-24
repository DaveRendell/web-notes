import { DriveFile } from './drive';

export type VaultNodeType = 'folder' | 'markdown' | 'other';

export type VaultNode = {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  type: VaultNodeType;
  children?: VaultNode[];
  source: DriveFile;
};
