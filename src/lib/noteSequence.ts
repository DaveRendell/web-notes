import type { VaultNode } from '../types/vault';
import { getVaultNodeDisplayName } from './vaultTree';

export type NoteSequenceNavigation = {
  next: VaultNode | null;
  nextNumber: string;
  previous: VaultNode | null;
  previousNumber: string;
};

export function getNoteSequenceNavigation(
  currentNote: VaultNode,
  notes: VaultNode[],
): NoteSequenceNavigation | null {
  const number = getLastNumber(getVaultNodeDisplayName(currentNote));
  if (!number) return null;

  const previousNumber = offsetNumber(number, -1n);
  const nextNumber = offsetNumber(number, 1n);
  const notesByPath = new Map(notes.map((note) => [note.path, note]));

  return {
    previousNumber,
    previous: notesByPath.get(currentNote.path.replaceAll(number, previousNumber)) ?? null,
    nextNumber,
    next: notesByPath.get(currentNote.path.replaceAll(number, nextNumber)) ?? null,
  };
}

function getLastNumber(title: string) {
  const matches = title.match(/\d+/g);
  return matches?.at(-1) ?? null;
}

function offsetNumber(number: string, offset: bigint) {
  const result = BigInt(number) + offset;
  if (result < 0n) return result.toString();
  return result.toString().padStart(number.length, '0');
}
