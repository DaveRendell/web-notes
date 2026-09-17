import { describe, expect, it } from 'vitest';
import type { VaultNode } from '../types/vault';
import { getNoteSequenceNavigation } from './noteSequence';

describe('getNoteSequenceNavigation', () => {
  it('uses the first number in the title and replaces every complete occurrence in the path', () => {
    const previous = note('previous', 'Media/2024/2024 Games.md');
    const current = note('current', 'Media/2025/2025 Games.md');
    const next = note('next', 'Media/2026/2026 Games.md');

    expect(getNoteSequenceNavigation(current, [previous, current, next])).toEqual({
      currentNumber: '2025',
      previous,
      previousNumber: '2024',
      next,
      nextNumber: '2026',
    });
  });

  it('uses the first number when a title contains more than one', () => {
    const current = note('current', 'Reports/12/Edition 12 for 2025.md');
    const next = note('next', 'Reports/13/Edition 13 for 2025.md');

    expect(getNoteSequenceNavigation(current, [current, next])).toEqual({
      currentNumber: '12',
      previous: null,
      previousNumber: '11',
      next,
      nextNumber: '13',
    });
  });

  it('preserves leading zeroes', () => {
    const previous = note('previous', 'Journal/008/Entry 008.md');
    const current = note('current', 'Journal/009/Entry 009.md');
    const next = note('next', 'Journal/010/Entry 010.md');

    expect(getNoteSequenceNavigation(current, [previous, current, next])).toEqual({
      currentNumber: '009',
      previous,
      previousNumber: '008',
      next,
      nextNumber: '010',
    });
  });

  it('does not add leading zeroes when a sequence crosses to fewer digits', () => {
    const previous = note('previous', 'Journal/2021/Week 9 2021.md');
    const current = note('current', 'Journal/2021/Week 10 2021.md');
    const next = note('next', 'Journal/2021/Week 11 2021.md');

    expect(getNoteSequenceNavigation(current, [previous, current, next])).toEqual({
      currentNumber: '10',
      previous,
      previousNumber: '9',
      next,
      nextNumber: '11',
    });
  });

  it('does not replace the sequence number inside a longer number', () => {
    const previous = note('previous', 'Journal/2021/Week 19 2021.md');
    const current = note('current', 'Journal/2021/Week 20 2021.md');
    const next = note('next', 'Journal/2021/Week 21 2021.md');

    expect(getNoteSequenceNavigation(current, [previous, current, next])).toEqual({
      currentNumber: '20',
      previous,
      previousNumber: '19',
      next,
      nextNumber: '21',
    });
  });

  it('returns labels with missing matches and ignores numbers found only in folders', () => {
    const current = note('current', 'Media/2025/Games.md');
    expect(getNoteSequenceNavigation(current, [current])).toBeNull();

    const numbered = note('numbered', 'Media/Games 3.md');
    expect(getNoteSequenceNavigation(numbered, [numbered])).toEqual({
      currentNumber: '3',
      previous: null,
      previousNumber: '2',
      next: null,
      nextNumber: '4',
    });
  });
});

function note(id: string, path: string): VaultNode {
  const name = path.split('/').at(-1)!;
  return {
    id,
    name,
    path,
    mimeType: 'text/markdown',
    source: { id, name, mimeType: 'text/markdown' },
    type: 'markdown',
  };
}
