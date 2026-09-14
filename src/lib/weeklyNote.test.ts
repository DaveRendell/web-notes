import { describe, expect, it } from 'vitest';
import { applyWeeklyNoteTemplate, getIsoWeek, getWeeklyNoteDetails } from './weeklyNote';

describe('weekly notes', () => {
  it.each([
    ['2026-09-14T12:00:00', { weekNumber: 38, year: 2026 }],
    ['2024-12-30T12:00:00', { weekNumber: 1, year: 2025 }],
    ['2027-01-03T12:00:00', { weekNumber: 53, year: 2026 }],
  ])('calculates the ISO week for %s', (value, expected) => {
    expect(getIsoWeek(new Date(value))).toEqual(expected);
  });

  it('builds the hardcoded weekly note path', () => {
    expect(getWeeklyNoteDetails(new Date('2026-09-14T12:00:00'))).toEqual({
      filename: 'Week 38 2026.md',
      path: 'Weeks/2026/Week 38 2026.md',
      weekNumber: 38,
      weeksFolderPath: 'Weeks',
      year: 2026,
      yearFolderPath: 'Weeks/2026',
    });
  });

  it('replaces every template placeholder', () => {
    expect(applyWeeklyNoteTemplate('# Week $week, $year\n\n[Week $week]', 38, 2026))
      .toBe('# Week 38, 2026\n\n[Week 38]');
  });
});
