import type { LocalNote } from './localVaultCore';

export type LocalNoteSequenceNavigation = {
  currentNumber: string;
  next: LocalNote | null;
  nextNumber: string;
  previous: LocalNote | null;
  previousNumber: string;
};

export function getLocalNoteSequenceNavigation(currentNote: LocalNote, notes: LocalNote[]): LocalNoteSequenceNavigation | null {
  const title = currentNote.name.replace(/\.md$/i, '');
  const number = title.match(/\d+/)?.[0];
  if (!number) return null;
  const previousNumber = offsetNumber(number, -1n);
  const nextNumber = offsetNumber(number, 1n);
  const notesByPath = new Map(notes.map((note) => [note.path, note]));
  return {
    currentNumber: number,
    previousNumber,
    previous: notesByPath.get(replaceNumber(currentNote.path, number, previousNumber)) ?? null,
    nextNumber,
    next: notesByPath.get(replaceNumber(currentNote.path, number, nextNumber)) ?? null,
  };
}

function offsetNumber(number: string, offset: bigint) {
  const result = BigInt(number) + offset;
  return result >= 0n && number.startsWith('0') ? result.toString().padStart(number.length, '0') : result.toString();
}

function replaceNumber(path: string, number: string, replacement: string) {
  return path.replace(new RegExp(`(?<!\\d)${number}(?!\\d)`, 'g'), replacement);
}
