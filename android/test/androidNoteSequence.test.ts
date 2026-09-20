import { describe, expect, it } from 'vitest';
import { getLocalNoteSequenceNavigation } from '../noteSequence';

const note = (path: string) => ({ kind: 'note' as const, uri: path, path, parentPath: path.slice(0, path.lastIndexOf('/')), name: path.slice(path.lastIndexOf('/') + 1), size: 0 });

describe('Android sequential note navigation', () => {
  it('uses the first number in the filename and replaces every standalone path occurrence', () => {
    const current = note('Media/2025/Week 10 2025.md');
    const navigation = getLocalNoteSequenceNavigation(current, [current, note('Media/2024/Week 9 2024.md'), note('Media/2026/Week 11 2026.md')]);
    expect(navigation).toMatchObject({ currentNumber: '10', previousNumber: '9', nextNumber: '11' });
    expect(navigation?.previous).toBeNull();
    expect(navigation?.next).toBeNull();
  });

  it('finds matching notes including transitions in digit length', () => {
    const current = note('Weeks/2021/Week 10 2021.md');
    const previous = note('Weeks/2021/Week 9 2021.md');
    const next = note('Weeks/2021/Week 11 2021.md');
    expect(getLocalNoteSequenceNavigation(current, [current, previous, next])).toMatchObject({ previous, next });
  });
});
