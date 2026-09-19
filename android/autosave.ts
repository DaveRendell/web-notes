export type MobileEditorMode = 'rich' | 'source';

export const MOBILE_AUTOSAVE_DELAY_MS = 350;

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
