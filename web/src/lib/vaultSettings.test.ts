import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createVaultSettings,
  loadDriveVaultSettings,
  parseVaultSettings,
  saveDriveVaultSettings,
  serializeVaultSettings,
} from './vaultSettings';

const mocks = vi.hoisted(() => ({
  createDriveTextFile: vi.fn(),
  findDriveChildByName: vi.fn(),
  getDriveFileText: vi.fn(),
  updateDriveTextFile: vi.fn(),
}));

vi.mock('./googleDrive', () => mocks);

afterEach(() => vi.clearAllMocks());

describe('vault settings', () => {
  it('parses, deduplicates, and serializes favourite IDs', () => {
    expect(parseVaultSettings('{"version":1,"favourites":["one","two","one",42]}')).toEqual({
      version: 1,
      favourites: ['one', 'two'],
    });
    expect(serializeVaultSettings(createVaultSettings(['one']))).toBe(
      '{\n  "version": 1,\n  "favourites": [\n    "one"\n  ]\n}\n',
    );
  });

  it('rejects malformed or unsupported settings', () => {
    expect(() => parseVaultSettings('{}')).toThrow('.web-notes.json');
    expect(() => parseVaultSettings('{"version":2,"favourites":[]}')).toThrow('.web-notes.json');
    expect(() => parseVaultSettings('not json')).toThrow();
  });

  it('returns empty settings when the vault has no settings file', async () => {
    mocks.findDriveChildByName.mockResolvedValue(null);

    await expect(loadDriveVaultSettings('token', 'vault')).resolves.toEqual({
      file: null,
      settings: { version: 1, favourites: [] },
    });
    expect(mocks.findDriveChildByName).toHaveBeenCalledWith({
      accessToken: 'token',
      folderId: 'vault',
      name: '.web-notes.json',
    });
    expect(mocks.getDriveFileText).not.toHaveBeenCalled();
  });

  it('loads an existing settings file and updates it on save', async () => {
    const file = { id: 'settings', mimeType: 'application/json', name: '.web-notes.json' };
    mocks.findDriveChildByName.mockResolvedValue(file);
    mocks.getDriveFileText.mockResolvedValue('{"version":1,"favourites":["note"]}');
    mocks.updateDriveTextFile.mockResolvedValue(file);

    await expect(loadDriveVaultSettings('token', 'vault')).resolves.toEqual({
      file,
      settings: { version: 1, favourites: ['note'] },
    });
    await saveDriveVaultSettings('token', 'vault', 'settings', createVaultSettings(['note']));
    expect(mocks.updateDriveTextFile).toHaveBeenCalledWith(
      'token',
      'settings',
      expect.stringContaining('"note"'),
      'application/json',
    );
  });

  it('creates the hidden settings file when it does not exist', async () => {
    mocks.createDriveTextFile.mockResolvedValue({
      id: 'settings',
      mimeType: 'application/json',
      name: '.web-notes.json',
    });

    await saveDriveVaultSettings('token', 'vault', null, createVaultSettings(['note']));
    expect(mocks.createDriveTextFile).toHaveBeenCalledWith(
      'token',
      'vault',
      '.web-notes.json',
      expect.stringContaining('"note"'),
      'application/json',
    );
  });
});
