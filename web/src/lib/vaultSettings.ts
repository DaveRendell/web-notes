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
  favouritePaths?: Record<string, string>;
};

export type LoadedVaultSettings = {
  file: DriveFile | null;
  settings: VaultSettings;
};

export function createVaultSettings(favourites: string[] = [], favouritePaths?: Record<string, string>): VaultSettings {
  const unique = uniqueStrings(favourites);
  const paths = Object.fromEntries(unique.flatMap((id) => {
    const path = favouritePaths?.[id];
    return typeof path === 'string' && path.endsWith('.md') && !path.startsWith('/') && !path.split('/').includes('..')
      ? [[id, path]] : [];
  }));
  return Object.keys(paths).length ? { version: 1, favourites: unique, favouritePaths: paths } : { version: 1, favourites: unique };
}

export function parseVaultSettings(content: string): VaultSettings {
  const value = JSON.parse(content) as unknown;

  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.favourites)) {
    throw new Error(`${VAULT_SETTINGS_FILE_NAME} is not a valid Web Notes settings file.`);
  }

  const paths = isObject(value.favouritePaths) ? value.favouritePaths as Record<string, string> : undefined;
  return createVaultSettings(value.favourites.filter((item): item is string => typeof item === 'string'), paths);
}

export function serializeVaultSettings(settings: VaultSettings) {
  return `${JSON.stringify(createVaultSettings(settings.favourites, settings.favouritePaths), null, 2)}\n`;
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
