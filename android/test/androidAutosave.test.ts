import { describe, expect, it } from 'vitest';
import { MOBILE_AUTOSAVE_DELAY_MS, shouldAutosave } from '../autosave';

describe('Android rich-text autosave', () => {
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
