import type { DriveFile } from '../types/drive';
import {
  createDriveTextFile,
  findDriveChildByName,
  getDriveFileText,
  updateDriveTextFile,
} from './googleDrive';

export const VAULT_SETTINGS_FILE_NAME = '.web-notes.json';

export type VaultSettings = {
  version: 1;
  favourites: string[];
};

export type LoadedVaultSettings = {
  file: DriveFile | null;
  settings: VaultSettings;
};

export function createVaultSettings(favourites: string[] = []): VaultSettings {
  return { version: 1, favourites: uniqueStrings(favourites) };
}

export function parseVaultSettings(content: string): VaultSettings {
  const value = JSON.parse(content) as unknown;

  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.favourites)) {
    throw new Error(`${VAULT_SETTINGS_FILE_NAME} is not a valid Web Notes settings file.`);
  }

  return createVaultSettings(value.favourites.filter((item): item is string => typeof item === 'string'));
}

export function serializeVaultSettings(settings: VaultSettings) {
  return `${JSON.stringify(createVaultSettings(settings.favourites), null, 2)}\n`;
}

export async function loadDriveVaultSettings(
  accessToken: string,
  vaultId: string,
): Promise<LoadedVaultSettings> {
  const file = await findDriveChildByName({
    accessToken,
    folderId: vaultId,
    name: VAULT_SETTINGS_FILE_NAME,
  });

  if (!file) return { file: null, settings: createVaultSettings() };

  const content = await getDriveFileText(accessToken, file.id);
  return { file, settings: parseVaultSettings(content) };
}

export async function saveDriveVaultSettings(
  accessToken: string,
  vaultId: string,
  fileId: string | null,
  settings: VaultSettings,
) {
  const content = serializeVaultSettings(settings);

  if (fileId) {
    return updateDriveTextFile(accessToken, fileId, content, 'application/json');
  }

  return createDriveTextFile(
    accessToken,
    vaultId,
    VAULT_SETTINGS_FILE_NAME,
    content,
    'application/json',
  );
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
