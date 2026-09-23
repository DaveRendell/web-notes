import { describe, expect, it } from 'vitest';
import { formatCalendarEventStart } from './calendarEventDisplay';

describe('calendar event display', () => {
  it('shows a date without an all-day marker for all-day events', () => {
    expect(formatCalendarEventStart({ start: { date: '2026-09-23' } }, 'Europe/London', 'en-GB')).toEqual({
      date: 'Wed 23 Sept',
      time: null,
    });
  });

  it('shows the local start date and time for timed events', () => {
    expect(formatCalendarEventStart({ start: { dateTime: '2026-09-23T23:30:00Z' } }, 'Europe/London', 'en-GB')).toEqual({
      date: 'Thu 24 Sept',
      time: '0:30',
    });
  });
});
