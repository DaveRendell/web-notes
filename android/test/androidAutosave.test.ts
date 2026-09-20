import { describe, expect, it, vi } from 'vitest';
import { MOBILE_AUTOSAVE_DELAY_MS, flushLatestDraft, shouldAutosave } from '../autosave';

describe('Android rich-text autosave', () => {
  it('flushes an undo after the pending save changes the baseline', async () => {
    let baseline = 'original';
    const draft = 'original'; // User undid the edit while its save was pending.
    let finishWrite!: () => void;
    const pending = new Promise<boolean>((resolve) => {
      finishWrite = () => { baseline = 'edited'; resolve(true); };
    });
    const save = vi.fn(async () => { baseline = draft; return true; });
    const result = flushLatestDraft({ getPendingSave: () => pending, isClean: () => draft === baseline, save });
    expect(save).not.toHaveBeenCalled();
    finishWrite();
    await expect(result).resolves.toBe('saved');
    expect(save).toHaveBeenCalledOnce();
    expect(baseline).toBe('original');
  });

  it('leaves the draft open when a pending save fails', async () => {
    const save = vi.fn();
    await expect(flushLatestDraft({ getPendingSave: () => Promise.resolve(false), isClean: () => true, save })).resolves.toBe('failed');
    expect(save).not.toHaveBeenCalled();
  });

  it('uses a short local-filesystem debounce', () => {
    expect(MOBILE_AUTOSAVE_DELAY_MS).toBe(350);
  });

  it('saves changed rich-text drafts when no write is active', () => {
    expect(shouldAutosave({ blockedRevision: null, dirty: true, mode: 'rich', revision: 2, saving: false })).toBe(true);
  });

  it('does not autosave source edits, clean drafts, active writes, initial content, or a failed revision', () => {
    expect(shouldAutosave({ blockedRevision: null, dirty: true, mode: 'source', revision: 2, saving: false })).toBe(false);
    expect(shouldAutosave({ blockedRevision: null, dirty: false, mode: 'rich', revision: 2, saving: false })).toBe(false);
    expect(shouldAutosave({ blockedRevision: null, dirty: true, mode: 'rich', revision: 2, saving: true })).toBe(false);
    expect(shouldAutosave({ blockedRevision: null, dirty: true, mode: 'rich', revision: 0, saving: false })).toBe(false);
    expect(shouldAutosave({ blockedRevision: 2, dirty: true, mode: 'rich', revision: 2, saving: false })).toBe(false);
    expect(shouldAutosave({ blockedRevision: 2, dirty: true, mode: 'rich', revision: 3, saving: false })).toBe(true);
  });
});
