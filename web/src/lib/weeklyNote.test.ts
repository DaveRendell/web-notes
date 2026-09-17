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
      monday: '2026-09-14',
      path: 'Weeks/2026/Week 38 2026.md',
      sunday: '2026-09-20',
      weekNumber: 38,
      weeksFolderPath: 'Weeks',
      year: 2026,
      yearFolderPath: 'Weeks/2026',
    });
  });

  it('replaces every template placeholder', () => {
    const details = getWeeklyNoteDetails(new Date('2026-09-14T12:00:00'));
    const template = [
      '# Week $week, $year',
      '',
      '[Week $week]',
      '',
      '<!-- web-notes:calendar {"start":"$monday","end":"$sunday","timezone":"Europe/London","calendars":["primary"]} -->',
    ].join('\n');

    expect(applyWeeklyNoteTemplate(template, details)).toBe([
      '# Week 38, 2026',
      '',
      '[Week 38]',
      '',
      '<!-- web-notes:calendar {"start":"2026-09-14","end":"2026-09-20","timezone":"Europe/London","calendars":["primary"]} -->',
    ].join('\n'));
  });

  it('uses the correct dates for an ISO week crossing a calendar year', () => {
    expect(getWeeklyNoteDetails(new Date('2024-12-30T12:00:00'))).toEqual(expect.objectContaining({
      monday: '2024-12-30',
      sunday: '2025-01-05',
      weekNumber: 1,
      year: 2025,
    }));
  });
});
