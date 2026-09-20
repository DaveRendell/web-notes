import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  text: '',
  legacyWrite: vi.fn(),
  nativeWrite: vi.fn(async (_uri: string, text: string) => { storage.text = text; }),
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/',
  StorageAccessFramework: {
    readAsStringAsync: async () => storage.text,
    writeAsStringAsync: storage.legacyWrite,
  },
}));
vi.mock('expo-file-system', () => ({ Directory: class {} }));
vi.mock('../modules/fast-saf', () => ({ default: { writeText: storage.nativeWrite } }));

import { readNote, saveNote } from '../localVault';

beforeEach(() => {
  storage.text = '';
  vi.clearAllMocks();
});

describe('Android note storage', () => {
  it('routes successive shorter autosaves through the truncating native writer', async () => {
    storage.text = '---\r\ntitle: Test\r\n---\r\nA long original note 📝';
    let baseline = await readNote('content://notes/1');
    for (const draft of ['---\r\ntitle: Test\r\n---\r\nShort 📝', 'Short', '', 'New text']) {
      await saveNote('content://notes/1', baseline, draft);
      expect(await readNote('content://notes/1')).toBe(draft);
      expect(storage.nativeWrite).toHaveBeenLastCalledWith('content://notes/1', draft);
      baseline = draft;
    }
    expect(storage.legacyWrite).not.toHaveBeenCalled();
  });

  it('still refuses external changes before invoking the writer', async () => {
    storage.text = 'Another app changed this';
    await expect(saveNote('content://notes/1', 'Original', 'My draft')).rejects.toThrow('changed on the phone');
    expect(storage.nativeWrite).not.toHaveBeenCalled();
  });
});
