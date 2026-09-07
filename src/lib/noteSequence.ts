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
  const number = getFirstNumber(getVaultNodeDisplayName(currentNote));
  if (!number) return null;

  const previousNumber = offsetNumber(number, -1n);
  const nextNumber = offsetNumber(number, 1n);
  const notesByPath = new Map(notes.map((note) => [note.path, note]));

  return {
    previousNumber,
    previous: notesByPath.get(replaceNumber(currentNote.path, number, previousNumber)) ?? null,
    nextNumber,
    next: notesByPath.get(replaceNumber(currentNote.path, number, nextNumber)) ?? null,
  };
}

function getFirstNumber(title: string) {
  return title.match(/\d+/)?.[0] ?? null;
}

function offsetNumber(number: string, offset: bigint) {
  const result = BigInt(number) + offset;
  if (result < 0n) return result.toString();
  return number.startsWith('0')
    ? result.toString().padStart(number.length, '0')
    : result.toString();
}

function replaceNumber(path: string, number: string, replacement: string) {
  return path.replace(new RegExp(`(?<!\\d)${number}(?!\\d)`, 'g'), replacement);
}
