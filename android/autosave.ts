export type MobileEditorMode = 'rich' | 'source';

export const MOBILE_AUTOSAVE_DELAY_MS = 350;

export async function flushLatestDraft({
  getPendingSave, isClean, save,
}: {
  getPendingSave(): Promise<boolean> | null;
  isClean(): boolean;
  save(): Promise<boolean>;
}): Promise<'saved' | 'failed' | 'changing'> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // An in-flight save can change the baseline even after an undo made the
    // draft appear clean. Wait before deciding it is safe to leave the note.
    const pending = getPendingSave();
    if (pending && !await pending) return 'failed';
    if (isClean()) return 'saved';
    if (!await save()) return 'failed';
  }
  return isClean() ? 'saved' : 'changing';
}

export function shouldAutosave({
  blockedRevision,
  dirty,
  mode,
  revision,
  saving,
}: {
  blockedRevision: number | null;
  dirty: boolean;
  mode: MobileEditorMode;
  revision: number;
  saving: boolean;
}): boolean {
  return dirty && !saving && mode === 'rich' && revision > 0 && blockedRevision !== revision;
}
